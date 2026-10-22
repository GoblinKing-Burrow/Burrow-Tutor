import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerCoreCapabilityRoutes } from '../server/advanced/core-capabilities.mjs';
import { registerDiagnosticAdapter, registerAdvancedTools, clearAdvancedToolState } from '../server/advanced/diagnostics-tools.mjs';
import { registerPersistentDataRoutes } from '../server/advanced/persistent-data.mjs';

function fixture() {
  const routes = new Map(); const tools = []; let diagnostics; const calls = [];
  const context = {
    id: 'burrow-reference-mod',
    api: Object.fromEntries(['get','post','put','patch','delete'].map(method => [method, (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler)])),
    agents: { list: async () => [{ id: 'hatchet', name: 'Hatchet', enabled: true }] },
    operator: { displayIdentity: async () => ({ id: 'operator', name: 'Goblin King' }), timezone: async () => ({ timezone: 'America/Chicago' }) },
    conversations: {
      list: async input => (calls.push(['conversation-list', input]), { conversations: [{ id: 'default', agentId: input.agentId }], hasMore: false, nextCursor: null }),
      read: async input => (calls.push(['conversation-read', input]), { turns: [{ id: 'turn-1', content: 'hello' }], gaps: [], hasMore: false, nextCursor: null, historyStatus: 'complete', historyWarnings: [] }),
    },
    models: {
      list: async () => [{ connectionId: 'c', model: 'm', provider: 'test', reasoningEfforts: ['low'], defaultReasoningEffort: 'low', supportsTemperature: true, defaultTemperature: 0.2 }],
      generateText: async input => (calls.push(['generate', input]), { text: 'Generated.' }),
    },
    scheduler: {
      list: async input => (calls.push(['jobs-list', input]), { jobs: [{ id: 'job-1', name: 'Example', enabled: false, createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z' }], hasMore: false, nextCursor: null }),
      read: async id => ({ id, name: 'Example', enabled: false, createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z' }),
      create: async input => (calls.push(['job-create', input]), { id: 'job-2', ...input }),
      update: async (id, patch) => ({ id, ...patch }), delete: async id => ({ id }),
      runs: async () => ({ runs: [], hasMore: false, nextCursor: null }), trigger: async id => ({ id, accepted: true }),
    },
    diagnostics: { register: adapter => { diagnostics = adapter; } },
    runtimeDiagnostics: { read: async (input, options) => (calls.push(['runtime-diagnostics', input, options]), { ok: true, operation: input.operation }) },
    secrets: { has: async () => true, get: async () => 'hidden-value' },
    tools: { register: tool => tools.push(tool) },
  };
  registerCoreCapabilityRoutes(context); registerDiagnosticAdapter(context); registerAdvancedTools(context);
  const request = (body = null, { query = {}, params = {}, auth = { enabled: true, authenticated: true } } = {}) => ({ body, query, params, auth });
  return { context, routes, tools, diagnostics: () => diagnostics, calls, request };
}

test.afterEach(() => clearAdvancedToolState());

test('identity, conversations and model examples validate then call Core capabilities', async () => {
  const f = fixture();
  assert.deepEqual((await f.routes.get('GET /advanced/identity')(f.request())).body, { ok: true, modId: 'burrow-reference-mod', operator: { id: 'operator', name: 'Goblin King' }, timezone: 'America/Chicago', agents: [{ id: 'hatchet', name: 'Hatchet', enabled: true }] });
  const conversations = await f.routes.get('GET /advanced/conversations')(f.request(null, { query: { agentId: 'hatchet', limit: '25', includeArchived: 'false' } }));
  assert.equal(conversations.body.conversations[0].id, 'default');
  assert.deepEqual(f.calls.at(-1)[1], { agentId: 'hatchet', limit: 25, includeArchived: false });
  const page = await f.routes.get('POST /advanced/conversations/read')(f.request({ agentId: 'hatchet', sessionId: 'default', limit: 10 }));
  assert.equal(page.body.historyStatus, 'complete');
  assert.equal((await f.routes.get('GET /advanced/models')(f.request())).body.models[0].model, 'm');
  assert.equal((await f.routes.get('POST /advanced/models/generate')(f.request({ connectionId: 'c', model: 'm', prompt: 'Hello', effort: 'low', temperature: 0.3, confirmPaid: false }))).status, 400);
  const generated = await f.routes.get('POST /advanced/models/generate')(f.request({ connectionId: 'c', model: 'm', prompt: 'Hello', effort: 'low', temperature: 0.3, confirmPaid: true }));
  assert.equal(generated.body.text, 'Generated.');
  assert.deepEqual(f.calls.at(-1)[1], { connectionId: 'c', model: 'm', prompt: 'Hello', effort: 'low', temperature: 0.3 });
});

test('scheduler examples retain Core ownership and start jobs disabled unless requested', async () => {
  const f = fixture();
  assert.equal((await f.routes.get('GET /advanced/scheduler/jobs')(f.request())).body.jobs[0].id, 'job-1');
  const created = await f.routes.get('POST /advanced/scheduler/jobs')(f.request({ agentId: 'hatchet', name: 'Lesson', prompt: 'Teach', cron: '0 8 * * *' }));
  assert.equal(created.status, 201);
  assert.deepEqual(f.calls.at(-1)[1], { agentId: 'hatchet', name: 'Lesson', prompt: 'Teach', cron: '0 8 * * *' });
  assert.equal((await f.routes.get('POST /advanced/scheduler/jobs')(f.request({ agentId: 'hatchet', name: 'Bad', prompt: 'Teach', cron: '0 8 * * *', model: 'm' }))).status, 400);
  assert.equal((await f.routes.get('PATCH /advanced/scheduler/jobs/:jobId')(f.request({ model: 'm' }, { params: { jobId: 'job-1' } }))).status, 400);
  assert.equal((await f.routes.get('PATCH /advanced/scheduler/jobs/:jobId')(f.request({ name: 42 }, { params: { jobId: 'job-1' } }))).status, 400);
  assert.deepEqual((await f.routes.get('PATCH /advanced/scheduler/jobs/:jobId')(f.request({ modelConnectionId: null, model: null }, { params: { jobId: 'job-1' } }))).body.job, { id: 'job-1', modelConnectionId: null, model: null });
  assert.equal((await f.routes.get('POST /advanced/scheduler/jobs/:jobId/trigger')(f.request(null, { params: { jobId: 'job-1' } }))).status, 202);
});

test('diagnostic adapter is read-only and runtime diagnostics stay caller scoped', async () => {
  const f = fixture();
  const listing = await f.diagnostics().listJobs({ limit: 10 });
  assert.deepEqual(listing.jobs[0], { id: 'job-1', kind: 'scheduled-job', status: 'disabled', createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z', completeness: 'summary', resumable: true });
  const diagnosticTool = f.tools.find(tool => tool.name === 'reference_self_diagnostics');
  assert.equal(diagnosticTool.availability, 'mod-authorized');
  const controller = new AbortController();
  assert.equal((await diagnosticTool.handler({ operation: 'context-status' }, { agentId: 'hatchet', sessionId: 'default', signal: controller.signal })).operation, 'context-status');
  assert.deepEqual(f.calls.at(-1)[1], { operation: 'context-status' });
  assert.equal((await diagnosticTool.handler({ operation: 'trace', runId: 'run-1', includeToolOutput: false }, { agentId: 'hatchet', sessionId: 'default', signal: controller.signal })).operation, 'trace');
  assert.deepEqual(f.calls.at(-1)[1], { operation: 'trace', runId: 'run-1', includeToolOutput: false });
  await assert.rejects(diagnosticTool.handler({ operation: 'trace' }, { agentId: 'hatchet', signal: controller.signal }), /invalid_arguments/);
  await assert.rejects(diagnosticTool.handler({ operation: 'trace', runId: 'run-1', agentId: 'other' }, { agentId: 'hatchet', signal: controller.signal }), /invalid_arguments/);
});

test('one-turn sensitive result declares the secret without returning a plain value', async () => {
  const f = fixture(); const tool = f.tools.find(item => item.name === 'reference_sensitive_secret');
  const result = await tool.handler({});
  assert.deepEqual(result, { secret: { $burrowSensitive: { type: 'secret', value: 'hidden-value' } } });
  assert.equal(tool.availability, undefined);
});

test('managed protected result resolves only for the bound caller and version', async () => {
  const f = fixture(); const tool = f.tools.find(item => item.name === 'reference_protected_secret');
  const caller = { agentId: 'hatchet', sessionId: 'default', conversationId: 'chat' };
  const result = await tool.handler({}, caller); const declaration = result.secret.$burrowManaged;
  assert.equal(declaration.type, 'secret'); assert.ok(!JSON.stringify(result).includes('hidden-value'));
  assert.equal(await tool.resolveProtectedReference(declaration.reference, { ...caller, version: declaration.version }), 'hidden-value');
  await assert.rejects(tool.resolveProtectedReference(declaration.reference, { ...caller, version: declaration.version }), /protected_reference_denied/);
});

test('persistent mod-data example writes atomically beneath the reserved sibling', async (t) => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'burrow-tutor-data-')); t.after(() => fs.rm(runtimeRoot, { recursive: true, force: true }));
  const previous = process.env.BURROW_RUNTIME_ROOT; process.env.BURROW_RUNTIME_ROOT = runtimeRoot; t.after(() => { if (previous === undefined) delete process.env.BURROW_RUNTIME_ROOT; else process.env.BURROW_RUNTIME_ROOT = previous; });
  const routes = new Map(); registerPersistentDataRoutes({ id: 'burrow-reference-mod', api: { get: (p,h) => routes.set(`GET ${p}`,h), put: (p,h) => routes.set(`PUT ${p}`,h) } });
  const auth = { enabled: true, authenticated: true };
  assert.equal((await routes.get('PUT /advanced/data/note')({ auth, body: { text: 'durable lesson' } })).body.note.text, 'durable lesson');
  assert.equal((await routes.get('GET /advanced/data/note')({ auth })).body.note.text, 'durable lesson');
  const disk = JSON.parse(await fs.readFile(path.join(runtimeRoot, 'mods', 'mod-data', 'burrow-reference-mod', 'advanced-note.json'), 'utf8'));
  assert.equal(disk.text, 'durable lesson');
});
