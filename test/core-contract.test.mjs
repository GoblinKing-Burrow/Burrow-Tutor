import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreRoot = path.resolve(process.env.BURROW_CORE_ROOT || path.join(root, '..', 'Burrow-Backend'));
process.env.BURROW_SETTINGS_KEY ||= Buffer.alloc(32, 7).toString('base64');
async function memoryStore() { const settings = new Map(); const secrets = new Map(); return { get: async (n,f=null)=>settings.has(n)?settings.get(n):f, set: async(n,v)=>(settings.set(n,v),v), delete: async n=>settings.delete(n), getSecret: async n=>secrets.get(n)??null, setSecret: async(n,v)=>(v?secrets.set(n,String(v)):secrets.delete(n),true), clearSecret: async n=>secrets.delete(n), hasSecret: async n=>secrets.has(n), close: async()=>{} }; }
test('current Burrow Core discovers and hosts the packaged reference mod', async (t) => { const [{ discoverMods }, { startModHost }] = await Promise.all([import(pathToFileURL(path.join(coreRoot,'src/mod-runtime.mjs'))), import(pathToFileURL(path.join(coreRoot,'src/mod-host.mjs')))]); const runtimeRoot=await fs.mkdtemp('/tmp/burrow-reference-contract-'); const modsRoot=path.join(runtimeRoot,'mods'); await fs.mkdir(modsRoot,{recursive:true}); await fs.cp(root,path.join(modsRoot,'burrow-reference-mod'),{recursive:true,filter:(source)=>path.basename(source)!=='.git'}); t.after(()=>fs.rm(runtimeRoot,{recursive:true,force:true})); const [mod]=await discoverMods({runtimeRoot,logger:{warn(){}}}); assert.equal(mod.id,'burrow-reference-mod'); assert.notEqual(mod.status,'failed',mod.error); assert.deepEqual(Object.keys(mod.ui).sort(),['control','settings']); const host=startModHost({mod,store:await memoryStore(),logger:{debug(){},info(){},warn(){},error(){}}}); t.after(()=>host.close()); const activation=await host.activated; assert.deepEqual(activation.map(({method,path:routePath})=>`${method} ${routePath}`),['GET /status','PUT /configuration','GET /images/status','PUT /images/configuration','POST /images','GET /images/jobs/:jobId']); assert.deepEqual(activation.tools.map(({name,availability})=>({name,availability})),[{name:'reference_greet',availability:'grant-required'}]); assert.equal(activation.diagnosticsSupported,false); assert.equal((await host.invoke('route-1',{auth:{enabled:false,authenticated:false},body:null,query:{},params:{},headers:{},method:'GET',path:'/status'})).body.ok,true); assert.match((await host.invokeTool('reference_greet',{name:'Core'},{agentId:'fixture',sessionId:'session'})).message,/Core$/); });

test('packaged Forge scaffold uses current Core RPC, durable retry, and image ownership', async (t) => {
  const [{ startModHost }, { createModCapabilities }, { forgeFixture }] = await Promise.all([
    import(pathToFileURL(path.join(coreRoot, 'src/mod-host.mjs'))),
    import(pathToFileURL(path.join(coreRoot, 'src/mod-capabilities.mjs'))),
    import('./forge-fixture.mjs'),
  ]);
  const fixture = forgeFixture();
  const ownerModId = 'burrow-reference-mod';
  const makeCapabilities = (id) => createModCapabilities({
    ownerModId: id, resolveAgentRuntime: async () => ({}),
    stores: { agents: {}, models: {}, scheduledJobs: {}, conversations: {}, forge: fixture.forge },
  });
  const store = await memoryStore();
  let host;
  async function start() {
    host = startModHost({ mod: { id: ownerModId, server: path.join(root, 'server/index.mjs') }, store, capabilities: makeCapabilities(ownerModId) });
    await host.activated;
  }
  t.after(async () => { await host?.close(); });
  await start();
  // Route IDs follow registration order in activation (including parameter routes).
  async function invoke(id, body = null, params = {}, auth = { enabled: true, authenticated: true }) {
    return host.invoke(id, { auth, body, params, query: {}, headers: {} });
  }
  const status = () => invoke('route-3');
  const enable = (enabled) => invoke('route-4', { enabled });
  const create = (body) => invoke('route-5', body);
  const read = (jobId) => invoke('route-6', null, { jobId });
  assert.deepEqual((await status()).body, { ok: true, enabled: false, available: true });
  fixture.setSelection(null);
  assert.equal((await status()).body.reason, 'forge_selection_missing');
  fixture.setSelection({ connectionId: 'private-connection', modelId: 'private-model' });
  fixture.setAvailable(false);
  assert.equal((await status()).body.reason, 'forge_model_unavailable');
  fixture.setAvailable(true);
  const input = { requestId: 'illustration-1', prompt: 'A goblin stage', confirmPaid: true };
  assert.equal((await create(input)).status, 403);
  for (const id of ['route-3', 'route-4', 'route-5', 'route-6']) {
    assert.equal((await invoke(id, input, { jobId: 'job-1' }, { enabled: true, authenticated: false })).status, 401);
  }
  await enable(true);
  for (const bad of [{ ...input, confirmPaid: false }, { ...input, modelId: 'forged' }, { ...input, prompt: ' ' }, { ...input, requestId: '../x' }]) {
    assert.equal((await create(bad)).status, 400);
  }
  fixture.setAvailable(false);
  assert.equal((await create(input)).status, 503);
  fixture.setAvailable(true);
  assert.equal(fixture.creates.length, 0);
  const [first, duplicate] = await Promise.all([create(input), create(input)]);
  assert.equal(first.status, 202);
  assert.equal(first.body.job.status, 'queued'); // no terminal wait in route
  assert.equal(duplicate.body.job.id, first.body.job.id);
  assert.equal(duplicate.body.replayed, true);
  assert.equal(fixture.creates.length, 1);
  assert.deepEqual(fixture.creates[0], {
    input: { mode: 'image', prompt: input.prompt, idempotencyKey: `mod:${ownerModId}:image:illustration-1` },
    options: { ownerModId },
  });
  assert.equal((await store.get('forge-image-request:illustration-1')).jobId, first.body.job.id);
  assert.equal((await create({ ...input, prompt: 'Different paid intent' })).status, 409);
  await host.close();
  await start();
  assert.equal((await create(input)).body.replayed, true);
  assert.equal(fixture.creates.length, 1);
  const job = fixture.jobs.get(first.body.job.id);
  job.status = 'succeeded';
  job.artifacts = [{ id: 'artifact-1', kind: 'image', name: 'stage.png', mimeType: 'image/png', sizeBytes: 123, storageReference: 'private-storage', downloadUrl: 'private-download' }];
  const completed = await read(job.id);
  assert.equal(completed.body.job.status, 'succeeded');
  assert.equal(completed.body.job.artifacts[0].previewUrl, `/api/forge/jobs/${job.id}/artifacts/artifact-1`);
  assert.doesNotMatch(JSON.stringify(completed), /private-|A goblin stage|idempotencyKey|connectionId|modelId|downloadUrl|storageReference/);
  const foreign = makeCapabilities('other-mod');
  const other = await foreign.createForgeImage({ prompt: 'foreign', idempotencyKey: 'one' });
  assert.equal((await read(other.job.id)).body.error, 'image_request_failed');
  job.kind = 'music';
  assert.equal((await read(job.id)).body.error, 'image_request_failed');
  job.kind = 'image'; job.status = 'failed'; job.error = { code: 'forge_generation_failed' };
  assert.equal((await read(job.id)).body.job.error.code, 'forge_generation_failed');
  await enable(false);
  assert.equal((await read(job.id)).body.job.status, 'failed'); // disabling is not cancellation
  assert.equal((await create({ ...input, requestId: 'new' })).status, 403);
});

test('packaged advanced examples invoke current Core capability RPC and preserve boundaries', async (t) => {
  const [{ startModHost }, { createModCapabilities }, { advancedCoreFixture }, { activate: activateAdvanced }] = await Promise.all([
    import(pathToFileURL(path.join(coreRoot, 'src/mod-host.mjs'))),
    import(pathToFileURL(path.join(coreRoot, 'src/mod-capabilities.mjs'))),
    import('./advanced-core-fixture.mjs'),
    import('../server/advanced/index.example.mjs'),
  ]);
  assert.equal(typeof activateAdvanced, 'function');
  const fixture = advancedCoreFixture();
  const ownerModId = 'burrow-reference-mod';
  const capabilities = createModCapabilities({
    ownerModId,
    resolveAgentRuntime: fixture.resolveAgentRuntime,
    resolveAgentWorkspaceRoot: fixture.resolveAgentWorkspaceRoot,
    fetchImpl: fixture.fetchImpl,
    scheduledJobScheduler: fixture.scheduler,
    stores: fixture.stores,
    runtimeDiagnostics: fixture.runtimeDiagnostics,
    modAuthority: fixture.modAuthority,
  });
  const store = await memoryStore();
  await store.setSecret('example-secret', 'current-core-secret');
  const host = startModHost({ mod: { id: ownerModId, server: path.join(root, 'server/advanced/index.example.mjs') }, store, capabilities });
  t.after(() => host.close());
  await host.activated;
  const auth = { enabled: true, authenticated: true };
  const invoke = (routeId, { body = null, query = {}, params = {} } = {}) => host.invoke(routeId, { auth, body, query, params, headers: {} });

  const identity = await invoke('route-1');
  assert.deepEqual(identity.body, { ok: true, modId: ownerModId, operator: { id: 'goblin-king', name: 'Goblin King' }, timezone: 'America/Chicago', agents: [{ id: 'hatchet', name: 'Hatchet', enabled: true }] });
  assert.doesNotMatch(JSON.stringify(identity), /private-avatar|private-profile|never-exposed/);

  const inventory = await invoke('route-2', { query: { agentId: 'hatchet', limit: '10', includeArchived: 'true' } });
  assert.equal(inventory.body.conversations[0].id, 'default');
  const transcript = await invoke('route-3', { body: { agentId: 'hatchet', sessionId: 'default', limit: 10 } });
  assert.equal(transcript.body.ok, true, JSON.stringify(transcript.body));
  assert.deepEqual(transcript.body.turns.map((turn) => turn.content), ['Gladly.', 'Teach me.']);
  assert.equal(transcript.body.historyStatus, 'complete');

  const modelPage = await invoke('route-4');
  assert.deepEqual(modelPage.body.models[0], { connectionId: 'fixture-connection', model: 'fixture-model', provider: 'Fixture Provider', label: 'Fixture Model', contextWindow: 1_050_000, reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low', supportsTemperature: true, defaultTemperature: 0.2 });
  const generated = await invoke('route-5', { body: { connectionId: 'fixture-connection', model: 'fixture-model', prompt: 'Teach advanced mods.', maxTokens: 64, effort: 'high', temperature: 0.4, confirmPaid: true } });
  assert.equal(generated.body.text, 'Generated by current Core.');
  assert.equal(fixture.providerRequests.length, 1);
  assert.equal(fixture.providerRequests[0].tools, undefined);
  assert.equal(fixture.providerRequests[0].temperature, 0.4);
  assert.deepEqual(fixture.providerRequests[0].reasoning, { effort: 'high' });
  assert.doesNotMatch(JSON.stringify(generated), /never-exposed/);

  const created = await invoke('route-8', { body: { agentId: 'hatchet', name: 'Nightly lesson', prompt: 'Teach safely.', cron: '0 3 * * *' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.job.enabled, false);
  const jobId = created.body.job.id;
  assert.equal((await invoke('route-6')).body.jobs[0].id, jobId);
  assert.equal((await invoke('route-7', { params: { jobId } })).body.job.id, jobId);
  assert.equal((await invoke('route-9', { params: { jobId }, body: { enabled: true } })).body.job.enabled, true);
  assert.equal((await invoke('route-11', { params: { jobId } })).body.runs[0].jobId, jobId);
  assert.equal((await invoke('route-12', { params: { jobId } })).status, 202);
  assert.equal((await invoke('route-10', { params: { jobId } })).body.job.id, jobId);
  assert.equal((await invoke('route-7', { params: { jobId } })).status, 500);

  const diagnostics = await host.invokeTool('reference_self_diagnostics', { operation: 'context-status', sessionId: 'default' }, { agentId: 'hatchet', sessionId: 'default', conversationId: 'chat' });
  assert.deepEqual(diagnostics, { ok: true, operation: 'context-status', agentId: 'hatchet' });
  assert.deepEqual(fixture.diagnosticReads[0].input, { operation: 'context-status', sessionId: 'default' });
  assert.equal(fixture.diagnosticReads[0].global, false);

  const sensitive = await host.invokeTool('reference_sensitive_secret', {}, { agentId: 'hatchet', sessionId: 'default', conversationId: 'chat' });
  assert.deepEqual(sensitive, { secret: { $burrowSensitive: { type: 'secret', value: 'current-core-secret' } } });
  const managed = await host.invokeTool('reference_protected_secret', {}, { agentId: 'hatchet', sessionId: 'default', conversationId: 'chat' });
  const declaration = managed.secret.$burrowManaged;
  assert.ok(declaration.reference);
  assert.doesNotMatch(JSON.stringify(managed), /current-core-secret/);
  assert.equal(await host.resolveProtectedReference('reference_protected_secret', declaration.reference, { agentId: 'hatchet', sessionId: 'default', conversationId: 'chat', version: declaration.version }), 'current-core-secret');
  await assert.rejects(host.resolveProtectedReference('reference_protected_secret', declaration.reference, { agentId: 'hatchet', sessionId: 'default', conversationId: 'chat', version: declaration.version }), /mod_route_failed/);
});
