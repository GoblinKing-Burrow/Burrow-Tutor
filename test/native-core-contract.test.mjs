import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = name => import(pathToFileURL(path.join(process.env.BURROW_CORE_ROOT || path.join(root, '../Burrow-Backend'), 'src', name)));
process.env.BURROW_SETTINGS_KEY ||= Buffer.alloc(32, 7).toString('base64');

test('native lab crosses real Core host/capabilities/providers with controlled stores, no inference', async t => {
  const [{ startModHost }, { createModCapabilities }, runtime, { normalizeModAgent }, { validateReferenceImageUpload }] = await Promise.all([
    core('mod-host.mjs'), core('mod-capabilities.mjs'), core('mod-agent-runtime.mjs'), core('agent-registry.mjs'), core('postgres-agent-reference-image-store.mjs'),
  ]);
  const ownerModId = 'tutor-native-lab';
  const rows = new Map([['regular', { id: 'regular', name: 'Regular', enabled: true }]]);
  const selections = new Map(); const avatars = new Map(); const portraits = new Map(); const settings = new Map();
  const agents = {
    list: async () => [...rows.values()], get: async id => rows.get(id),
    async createOwned(input, options) {
      assert.equal(options.ownerModId, ownerModId);
      if (rows.has(input.id)) throw Error('duplicate');
      const row = { ...input, enabled: input.enabled ?? true }; rows.set(row.id, row);
      selections.set(row.id, { connectionId: options.modelConnectionId, model: options.model }); return row;
    },
    async updateOwned(id, patch) {
      const row = rows.get(id);
      for (const key of ['name', 'enabled']) if (patch[key] !== undefined) row[key] = patch[key];
      row.modAgent = normalizeModAgent(patch.modAgent, { ownerModId, partial: true, current: row.modAgent }); return row;
    },
  };
  const models = { hasAuth: async id => id === 'selected-connection', modelSelection: async id => selections.get(id),
    identities: async () => ({ agents: [...avatars].map(([id, avatar]) => ({ id, avatar })) }),
    saveIdentity: async ({ id, avatar }) => avatars.set(id, avatar),
  };
  const referenceImages = {};
  for (const [suffix, scoped] of [['', false], ['Mod', true]]) {
    referenceImages[`get${suffix}`] = async (...args) => portraits.get(JSON.stringify(args)) ?? null;
    referenceImages[`put${suffix}`] = async (...args) => {
      const body = args.pop(); const upload = validateReferenceImageUpload(body);
      const metadata = { id: `portrait-${portraits.size}`, mimeType: upload.mimeType, fileName: upload.fileName, sizeBytes: upload.bytes.length };
      if (scoped) assert.equal(args[0], ownerModId);
      portraits.set(JSON.stringify(args), metadata); return metadata;
    };
    referenceImages[`remove${suffix}`] = async (...args) => portraits.delete(JSON.stringify(args));
  }
  const feedReads = [];
  const events = [{ cursor: '1', agentId: 'regular', runId: 'run-1', origin: 'operator', source: 'operator-chat', outcome: 'succeeded' }, { cursor: '2', agentId: 'regular', runId: 'run-2', origin: 'background', source: 'queue_next', outcome: 'failed' }];
  const agentRuns = { list: async ({ cursor }) => {
    feedReads.push(cursor);
    const event = events.find(e => Number(e.cursor) > Number(cursor));
    return { events: event ? [event] : [], nextCursor: event?.cursor ?? cursor, hasMore: event?.cursor === '1' };
  } };
  const controller = new AbortController(); controller.abort();
  const capabilities = createModCapabilities({ ownerModId, resolveAgentRuntime: async () => { throw Error('runtime must not start'); },
    stores: { agents, models, scheduledJobs: {}, conversations: {}, referenceImages, agentRuns },
    activeAgentRuns: new Map([['one', { agentId: 'regular', runId: 'active', sessionId: 'chat', controller }]]),
    pendingHttpRuns: () => [{ agentId: 'regular', runId: 'pending', sessionId: 'chat', source: 'operator-chat' }],
  });
  const store = { get: async (key, fallback) => settings.has(key) ? settings.get(key) : fallback, set: async (key, value) => settings.set(key, value) };
  const host = startModHost({ mod: { id: ownerModId, server: path.join(root, 'server/advanced/native-agents.example.mjs') }, store, capabilities });
  t.after(async () => { runtime.revokeModAgentProvider(ownerModId); await host.close(); });
  const activation = await host.activated;
  assert.equal(activation.agentContextSupported, true); assert.equal(activation.sharedContextSupported, true); assert.equal(host.hasRunCompletionHandler, true);
  const mod = { id: ownerModId, status: 'loaded', host, agentContextSupported: true, sharedContextSupported: true };
  runtime.publishModAgentProvider(mod);
  const auth = { enabled: true, authenticated: true };
  const invoke = (routeId, body, params = {}) => host.invoke(routeId, { auth, body, params });
  assert.deepEqual(feedReads, [null, '1']); assert.equal(settings.get('native-run-cursor'), '2');
  await Promise.all([host.invoke('agent-run-completion', { cursor: '2' }), host.invoke('agent-run-completion', { cursor: '2' })]);
  assert.deepEqual(feedReads, [null, '1', '2', '2']);
  assert.equal((await host.invoke('route-2', { auth: { enabled: true, authenticated: false }, body: {} })).status, 401);
  const input = { id: 'resident', name: 'Resident', modelConnectionId: 'selected-connection', model: 'selected-model', capabilities: { a2a: true }, visibility: { agents: false, chat: false } };
  const created = await invoke('route-2', input); assert.equal(created.status, 200);
  assert.equal(created.body.modAgent.ownerModId, ownerModId); assert.equal(created.body.modAgent.capabilities.forge, false);
  assert.equal((await capabilities.listAgents()).some(a => a.id === 'resident'), false);
  assert.equal((await capabilities.listAgents({ includeHidden: true })).some(a => a.id === 'resident'), true);
  for (const bad of [{ ...input, ownerModId: 'forged' }, { ...input, capabilities: { shell: true } }, { ...input, modelConnectionId: 'unauthenticated' }, { ...input, visibility: { inventory: true } }]) assert.equal((await invoke('route-2', bad)).status, 400);
  assert.equal((await invoke('route-3', null, { agentId: 'regular' })).status, 400);
  const foreign = createModCapabilities({ ownerModId: 'foreign', resolveAgentRuntime: async () => ({}), stores: { agents, models, conversations: {}, scheduledJobs: {} } });
  await assert.rejects(foreign.readOwnedAgent({ agentId: 'resident' }), /mod_owned_agent_not_found/);
  const updated = await invoke('route-4', { capabilities: { forge: true }, visibility: { chat: true }, avatar: '' }, { agentId: 'resident' });
  assert.equal(updated.body.modAgent.capabilities.a2a, true); assert.equal(updated.body.modAgent.visibility.agents, false); assert.equal(updated.body.modAgent.visibility.chat, true);
  const residentRuntime = { agentId: 'resident', agent: rows.get('resident') };
  const context = await runtime.resolveModAgentContext(residentRuntime, { sessionId: 'logical-session' });
  assert.equal(context.profileFiles[0].name, 'SOUL.md'); assert.match(context.context[0].content, /resident.*logical-session/);
  const shared = await runtime.resolveSharedModContext({ agentId: 'regular', agent: rows.get('regular') }, { sessionId: 'a2a' });
  assert.equal(shared[0].ownerModId, ownerModId); assert.equal(shared[0].context[0].name, 'INTERACTION.md');
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(runtime.resolveModAgentContext(residentRuntime, { sessionId: 's', signal: aborted.signal }), /mod_agent_unavailable/);
  const photo = { fileName: 'portrait.png', content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2SAAAAABJRU5ErkJggg==' };
  for (const [get, put, remove, params] of [['route-5', 'route-6', 'route-7', { agentId: 'resident' }], ['route-8', 'route-9', 'route-10', { key: 'character' }]]) {
    assert.equal((await invoke(get, null, params)).body, null);
    const saved = await invoke(put, photo, params); assert.equal(saved.body.mimeType, 'image/png');
    assert.deepEqual((await invoke(get, null, params)).body, saved.body);
    assert.equal((await invoke(put, { ...photo, content: 'invalid' }, params)).status, 400);
    await invoke(remove, null, params); assert.equal((await invoke(get, null, params)).body, null);
  }
  assert.equal((await invoke('route-6', photo, { agentId: 'regular' })).status, 400);
  const status = await invoke('route-1'); assert.deepEqual(status.body.activity.runs.map(r => r.status), ['cancelling', 'response_pending']);
  assert.equal(status.body.cursor, '2'); assert.equal(status.body.owned.length, 1);
  runtime.revokeModAgentProvider(ownerModId);
  await assert.rejects(runtime.resolveModAgentContext(residentRuntime, { sessionId: 's' }), /mod_agent_unavailable/);
  assert.deepEqual(await runtime.resolveSharedModContext({ agentId: 'regular', agent: rows.get('regular') }, { sessionId: 's' }), []);
});
