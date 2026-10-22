import test from 'node:test';
import assert from 'node:assert/strict';
import { activate, referenceContract } from '../server/index.mjs';

function fixture() {
  const routes = new Map();
  const tools = [];
  const settings = new Map();
  const secrets = new Map();
  const logs = [];
  let diagnostics = null;
  const context = {
    id: 'burrow-reference-mod',
    api: Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map((method) => [method, (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)])),
    tools: { register: (tool) => tools.push(tool) },
    diagnostics: { register: (adapter) => { diagnostics = adapter; } },
    runtimeDiagnostics: { read: async (input) => ({ ok: true, input }) },
    settings: { get: async (name, fallback = null) => settings.has(name) ? settings.get(name) : fallback, set: async (name, value) => { settings.set(name, value); return value; }, delete: async (name) => settings.delete(name) },
    secrets: { get: async (name) => secrets.get(name) ?? null, set: async (name, value) => { secrets.set(name, value); return true; }, clear: async (name) => secrets.delete(name), has: async (name) => secrets.has(name) },
    agents: { list: async () => [{ id: 'hatchet', name: 'Hatchet', enabled: true }] },
    operator: { displayIdentity: async () => ({ id: 'operator', name: 'Goblin King' }), timezone: async () => ({ timezone: 'America/Chicago' }) },
    conversations: { list: async () => ({ conversations: [], hasMore: false, nextCursor: null }), read: async () => ({ turns: [], gaps: [], hasMore: false, nextCursor: null, historyStatus: 'complete', historyWarnings: [] }) },
    models: { list: async () => [], generateText: async () => ({ text: 'Generated.' }) },
    scheduler: { list: async () => ({ jobs: [], hasMore: false, nextCursor: null }), read: async (id) => ({ id, enabled: false }), create: async (job) => ({ id: 'job-1', ...job }), update: async (id, patch) => ({ id, ...patch }), delete: async (id) => ({ id }), runs: async () => ({ runs: [], hasMore: false, nextCursor: null }), trigger: async (id) => ({ id, accepted: true }) },
    logger: Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...values) => logs.push([level, ...values])])),
  };
  return { context, routes, tools, settings, secrets, logs, diagnostics: () => diagnostics };
}
const request = (body, auth = { enabled: true, authenticated: true }) => ({ body, auth, query: {}, params: {}, headers: {}, method: 'PUT', path: '/configuration' });
test('activation keeps the installed Beginner contract small', async () => { const f = fixture(); const cleanup = await activate(f.context); assert.deepEqual([...f.routes.keys()], ['GET /status', 'PUT /configuration', 'GET /images/status', 'PUT /images/configuration', 'POST /images', 'GET /images/jobs/:jobId']); assert.deepEqual(f.tools.map(({ name, availability }) => ({ name, availability: availability || 'grant-required' })), [{ name: 'reference_greet', availability: 'grant-required' }]); assert.equal(f.diagnostics(), null); assert.equal(typeof cleanup, 'function'); cleanup(); assert.deepEqual(f.logs.map((entry) => entry[1]), ['Burrow Reference Mod activated', 'Burrow Reference Mod stopped']); });
test('status returns public configuration without exposing the secret', async () => { const f = fixture(); await activate(f.context); f.secrets.set('example-secret', 'never-return-this'); const result = await f.routes.get('GET /status')({ auth: { enabled: false, authenticated: false } }); assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true, greeting: referenceContract.DEFAULT_GREETING, secretConfigured: true }); assert.doesNotMatch(JSON.stringify(result), /never-return-this/); });
test('configuration persists namespaced settings and write-only secret state', async () => { const f = fixture(); await activate(f.context); const save = await f.routes.get('PUT /configuration')(request({ greeting: '  Welcome.  ', secret: 'private-example' })); assert.deepEqual(save.body, { ok: true, greeting: 'Welcome.', secretConfigured: true }); assert.equal(f.settings.get('greeting'), 'Welcome.'); assert.equal(f.secrets.get('example-secret'), 'private-example'); assert.doesNotMatch(JSON.stringify(save), /private-example/); const clear = await f.routes.get('PUT /configuration')(request({ greeting: 'Welcome.', secret: '' })); assert.equal(clear.body.secretConfigured, false); assert.equal(f.secrets.has('example-secret'), false); });
test('configuration uses trusted auth context and rejects malformed input', async () => { const f = fixture(); await activate(f.context); const denied = await f.routes.get('PUT /configuration')(request({ greeting: 'Nope' }, { enabled: true, authenticated: false })); assert.equal(denied.status, 401); for (const body of [null, {}, { greeting: '' }, { greeting: 'ok', surprise: true }, { greeting: 'x'.repeat(161) }]) assert.equal((await f.routes.get('PUT /configuration')(request(body))).status, 400); assert.equal((await f.routes.get('PUT /configuration')(request({ greeting: 'Trusted network' }, { enabled: false, authenticated: false }))).status, 200); });
test('tool validates arguments, reads current settings, and honors cancellation', async () => { const f = fixture(); await activate(f.context); f.settings.set('greeting', 'Greetings,'); const tool = f.tools[0]; assert.deepEqual(await tool.handler({ name: 'Ada' }, { signal: new AbortController().signal }), { ok: true, message: 'Greetings, Ada' }); await assert.rejects(tool.handler({ name: 'Ada', forged: true }, { signal: new AbortController().signal }), /invalid_arguments/); const controller = new AbortController(); controller.abort(); await assert.rejects(tool.handler({ name: 'Ada' }, { signal: controller.signal }), /cancelled/); });
