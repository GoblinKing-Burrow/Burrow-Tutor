import test from 'node:test';
import assert from 'node:assert/strict';
import { registerForgeImageRoutes } from '../server/forge-images.mjs';

function fixture() {
  const routes = new Map();
  const settings = new Map();
  const calls = [];
  let rejectWrite = () => false;
  const context = {
    api: Object.fromEntries(['get', 'put', 'post'].map((method) => [method, (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)])),
    settings: {
      get: async (name, fallback) => settings.has(name) ? structuredClone(settings.get(name)) : fallback,
      set: async (name, value) => {
        if (rejectWrite(name, value)) throw Error('private persistence error');
        settings.set(name, structuredClone(value));
      },
    },
    forge: {
      images: {
        status: async () => ({ available: true }),
        create: async (input) => {
          calls.push(input);
          return { job: { id: 'job-1', kind: 'image', status: 'queued', artifacts: [] }, replayed: calls.length > 1 };
        },
      },
      jobs: { read: async (id) => ({ id, kind: 'image', status: 'queued', artifacts: [] }) },
    },
  };
  const request = (body, auth = { enabled: true, authenticated: true }) => ({ body, auth });
  const invoke = (route, body, auth) => routes.get(route)(request(body, auth));
  registerForgeImageRoutes(context);
  return { context, routes, settings, calls, invoke, rejectWrite: (fn) => { rejectWrite = fn; } };
}
const input = { requestId: 'record-1', prompt: 'A goblin stage', confirmPaid: true };

test('image scaffold validates consent, trusted auth and exact configuration', async () => {
  const f = fixture();
  for (const auth of [{}, { enabled: true, authenticated: false }]) {
    assert.equal((await f.invoke('PUT /images/configuration', { enabled: true }, auth)).status, 401);
  }
  assert.equal((await f.routes.get('GET /images/status')({})).status, 401);
  for (const body of [null, {}, [], { enabled: 'yes' }, { enabled: true, modelId: 'private' }]) {
    assert.equal((await f.invoke('PUT /images/configuration', body)).status, 400);
  }
  assert.equal((await f.invoke('PUT /images/configuration', { enabled: true }, { enabled: false, authenticated: false })).status, 200);
  for (const body of [null, [], { ...input, confirmPaid: false }, { ...input, prompt: '' }, { ...input, prompt: 'x'.repeat(10_001) }, { ...input, requestId: 'x'.repeat(81) }, { ...input, idempotencyKey: 'forged' }]) {
    assert.equal((await f.invoke('POST /images', body)).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('failed intent persistence prevents paid dispatch', async () => {
  const f = fixture();
  await f.invoke('PUT /images/configuration', { enabled: true });
  f.rejectWrite((key) => key.startsWith('forge-image-request:'));
  const result = await f.invoke('POST /images', input);
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { ok: false, error: 'image_request_failed' });
  assert.equal(f.calls.length, 0);
});

test('lost receipt persistence retries the same key after host reload', async () => {
  const f = fixture();
  await f.invoke('PUT /images/configuration', { enabled: true });
  f.rejectWrite((key, value) => key.startsWith('forge-image-request:') && value.jobId);
  assert.equal((await f.invoke('POST /images', input)).status, 500);
  const intent = f.settings.get('forge-image-request:record-1');
  assert.equal(intent.jobId, null);
  assert.equal(typeof intent.promptHash, 'string');
  assert.doesNotMatch(JSON.stringify(intent), /goblin stage/);
  f.rejectWrite(() => false);
  registerForgeImageRoutes(f.context); // fresh in-memory state, same durable settings
  const retry = await f.invoke('POST /images', input);
  assert.equal(retry.status, 202);
  assert.equal(retry.body.replayed, true);
  assert.deepEqual(f.calls, [
    { prompt: input.prompt, idempotencyKey: 'image:record-1' },
    { prompt: input.prompt, idempotencyKey: 'image:record-1' },
  ]);
  assert.equal(f.settings.get('forge-image-request:record-1').jobId, 'job-1');
});

test('failed creation never invents a receipt or exposes raw provider details', async () => {
  const f = fixture();
  await f.invoke('PUT /images/configuration', { enabled: true });
  f.context.forge.images.create = async () => { throw Object.assign(Error('provider key and prompt must stay private'), { statusCode: 429 }); };
  const result = await f.invoke('POST /images', input);
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { ok: false, error: 'image_request_failed' });
  assert.equal(f.settings.get('forge-image-request:record-1').jobId, null);
});
