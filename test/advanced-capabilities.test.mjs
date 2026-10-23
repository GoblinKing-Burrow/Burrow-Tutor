import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerCoreCapabilityRoutes } from '../server/advanced/core-capabilities.mjs';
import { registerExternalAgentTurnRoutes } from '../server/advanced/external-agent-turns.mjs';
import { registerDiagnosticAdapter, registerAdvancedTools, clearAdvancedToolState } from '../server/advanced/diagnostics-tools.mjs';
import { registerPersistentDataRoutes } from '../server/advanced/persistent-data.mjs';

function fixture() {
  const routes = new Map(); const tools = []; let diagnostics; const calls = []; const settings = new Map(); const turns = new Map(); const generationJobs = new Map();
  const context = {
    id: 'burrow-reference-mod',
    api: Object.fromEntries(['get','post','put','patch','delete'].map(method => [method, (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler)])),
    settings: { get: async (name, fallback = null) => settings.has(name) ? settings.get(name) : fallback, set: async (name, value) => (settings.set(name, structuredClone(value)), value) },
    agents: {
      list: async () => [{ id: 'hatchet', name: 'Hatchet', enabled: true }, { id: 'sleeping', name: 'Sleeping', enabled: false }],
      turns: {
        submit: async (input) => {
          calls.push(['turn-submit', structuredClone(input)]);
          const existing = turns.get(input.idempotencyKey);
          if (existing && JSON.stringify(existing.input) !== JSON.stringify(input)) throw Error('mod_external_turn_idempotency_conflict');
          const turn = existing?.turn || { id: 'external-turn-1', agentId: input.agentId, sessionId: input.sessionId, status: 'queued', runId: null, result: null, error: null };
          turns.set(input.idempotencyKey, { input: structuredClone(input), turn });
          return { turn: structuredClone(turn), replayed: !!existing };
        },
        read: async (id) => (calls.push(['turn-read', id]), structuredClone([...turns.values()].find((entry) => entry.turn.id === id)?.turn)),
      },
    },
    operator: { displayIdentity: async () => ({ id: 'operator', name: 'Goblin King' }), timezone: async () => ({ timezone: 'America/Chicago' }) },
    conversations: {
      list: async input => (calls.push(['conversation-list', input]), { conversations: [{ id: 'default', agentId: input.agentId }], hasMore: false, nextCursor: null }),
      read: async input => (calls.push(['conversation-read', input]), { turns: [{ id: 'turn-1', content: 'hello' }], gaps: [], hasMore: false, nextCursor: null, historyStatus: 'complete', historyWarnings: [] }),
    },
    models: {
      list: async () => [{ connectionId: 'c', model: 'm', provider: 'test', reasoningEfforts: ['low'], defaultReasoningEffort: 'low', supportsTemperature: true, defaultTemperature: 0.2 }],
      generateText: async input => (calls.push(['generate', input]), { text: 'Generated.' }),
      generations: {
        submit: async input => { calls.push(['generation-submit', input]); const existing = generationJobs.get(input.idempotencyKey); const job = existing || { id: 'generation-1', status: 'queued', text: null, error: null }; generationJobs.set(input.idempotencyKey, job); return { job, replayed: !!existing }; },
        read: async id => (calls.push(['generation-read', id]), [...generationJobs.values()].find(job => job.id === id)),
      },
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
  registerCoreCapabilityRoutes(context); registerExternalAgentTurnRoutes(context); registerDiagnosticAdapter(context); registerAdvancedTools(context);
  const request = (body = null, { query = {}, params = {}, auth = { enabled: true, authenticated: true } } = {}) => ({ body, query, params, auth });
  return { context, routes, tools, diagnostics: () => diagnostics, calls, settings, turns, request };
}

test.afterEach(() => clearAdvancedToolState());

test('identity, conversations and model examples validate then call Core capabilities', async () => {
  const f = fixture();
  assert.deepEqual((await f.routes.get('GET /advanced/identity')(f.request())).body, { ok: true, modId: 'burrow-reference-mod', operator: { id: 'operator', name: 'Goblin King' }, timezone: 'America/Chicago', agents: [{ id: 'hatchet', name: 'Hatchet', enabled: true }, { id: 'sleeping', name: 'Sleeping', enabled: false }] });
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
  assert.equal((await f.routes.get('POST /advanced/models/generations')(f.request({ connectionId: 'c', model: 'm', prompt: 'Slow', requestId: 'record-42', confirmPaid: false }))).status, 400);
  const accepted = await f.routes.get('POST /advanced/models/generations')(f.request({ connectionId: 'c', model: 'm', prompt: 'Slow', requestId: 'record-42', confirmPaid: true }));
  assert.equal(accepted.status, 202); assert.equal(accepted.body.job.status, 'queued');
  assert.deepEqual(f.calls.at(-1)[1], { connectionId: 'c', model: 'm', prompt: 'Slow', idempotencyKey: 'tutor-generation:record-42' });
  const polled = await f.routes.get('GET /advanced/models/generations/:jobId')(f.request(null, { params: { jobId: accepted.body.job.id } }));
  assert.equal(polled.body.job.id, accepted.body.job.id); assert.deepEqual(f.calls.at(-1), ['generation-read', accepted.body.job.id]);
});

test('external turns require operator opt-in, retain stable intent, return acceptance, and poll later', async () => {
  const f = fixture();
  const status = await f.routes.get('GET /advanced/agent-turns/status')(f.request());
  assert.equal(status.body.enabled, false);
  assert.deepEqual(status.body.agents.map(({ id, enabled }) => ({ id, enabled })), [{ id: 'hatchet', enabled: true }, { id: 'sleeping', enabled: false }]);
  const input = { requestId: 'telegram-update:99', agentId: 'hatchet', sessionId: 'telegram:42', message: 'hello', confirmDispatch: true };
  assert.equal((await f.routes.get('POST /advanced/agent-turns')(f.request(input))).status, 403);
  assert.equal(f.calls.some(([name]) => name === 'turn-submit'), false);
  assert.equal((await f.routes.get('PUT /advanced/agent-turns/configuration')(f.request({ enabled: true }))).body.enabled, true);
  assert.equal((await f.routes.get('POST /advanced/agent-turns')(f.request({ ...input, confirmDispatch: false }))).status, 400);
  const accepted = await f.routes.get('POST /advanced/agent-turns')(f.request(input));
  assert.equal(accepted.status, 202); assert.equal(accepted.body.turn.status, 'queued'); assert.equal(accepted.body.replayed, false);
  assert.deepEqual(f.calls.find(([name]) => name === 'turn-submit')[1], { agentId: 'hatchet', sessionId: 'telegram:42', message: 'hello', idempotencyKey: 'tutor-agent-turn:telegram-update:99' });
  const saved = f.settings.get('advanced-external-agent-turn:telegram-update:99');
  assert.equal(saved.turnId, accepted.body.turn.id); assert.equal(saved.idempotencyKey, 'tutor-agent-turn:telegram-update:99');
  assert.equal((await f.routes.get('POST /advanced/agent-turns')(f.request(input))).body.replayed, true);
  assert.equal((await f.routes.get('POST /advanced/agent-turns')(f.request({ ...input, message: 'changed' }))).status, 409);
  const entry = f.turns.get(saved.idempotencyKey); Object.assign(entry.turn, { status: 'succeeded', result: { answerText: 'done', decision: 'answer', blockers: [], verification: null } });
  const polled = await f.routes.get('GET /advanced/agent-turns/:requestId')(f.request(null, { params: { requestId: input.requestId } }));
  assert.equal(polled.body.turn.status, 'succeeded'); assert.equal(polled.body.turn.result.answerText, 'done');
  assert.deepEqual(f.calls.at(-1), ['turn-read', accepted.body.turn.id]);
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
