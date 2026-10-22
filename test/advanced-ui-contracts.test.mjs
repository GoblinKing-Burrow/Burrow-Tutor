import test from 'node:test';
import assert from 'node:assert/strict';
import { registerApiTargetExample } from '../server/advanced/api-targets.example.mjs';
import { createSettingsContribution, handleSettingsAction } from '../ui/declarative-settings.example.js';

function targetFixture() {
  const routes = new Map(); const settings = new Map();
  const context = {
    api: Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)])),
    settings: { get: async (key, fallback) => settings.has(key) ? settings.get(key) : fallback, set: async (key, value) => (settings.set(key, value), value) },
  };
  registerApiTargetExample(context);
  const request = (body = null, params = {}) => ({ auth: { enabled: true, authenticated: true }, body, params });
  return { routes, request };
}

test('standalone apiTargets example implements validated owner-scoped v1 CRUD', async () => {
  const f = targetFixture(); const value = { id: 'remote-one', name: 'Remote one', baseUrl: 'https://remote.example/api/', enabled: true };
  const created = await f.routes.get('POST /advanced/targets')(f.request(value));
  assert.equal(created.status, 201); assert.equal(created.body.target.baseUrl, 'https://remote.example/api');
  assert.equal((await f.routes.get('GET /advanced/targets')(f.request())).body.targets.length, 1);
  const updated = await f.routes.get('PUT /advanced/targets/:id')(f.request({ ...value, name: 'Renamed' }, { id: value.id }));
  assert.equal(updated.body.target.name, 'Renamed');
  assert.equal((await f.routes.get('POST /advanced/targets')(f.request({ ...value, id: 'local' }))).status, 400);
  assert.equal((await f.routes.get('POST /advanced/targets')(f.request({ ...value, id: 'bad', baseUrl: 'https://user:pass@remote.example' }))).status, 400);
  for (const invalid of [{ ...value, id: 12 }, { ...value, name: 12 }, { ...value, baseUrl: 12 }, { ...value, enabled: 'true' }]) {
    assert.equal((await f.routes.get('POST /advanced/targets')(f.request(invalid))).status, 400);
  }
  assert.equal((await f.routes.get('DELETE /advanced/targets/:id')(f.request(null, { id: value.id }))).status, 200);
  assert.deepEqual((await f.routes.get('GET /advanced/targets')(f.request())).body.targets, []);
});

test('standalone declarative Settings example uses Core-rendered fields and scoped actions', async () => {
  const calls = [];
  const api = async (path, init) => {
    calls.push({ path, init });
    if (!init) return { ok: true, greeting: 'Hello from Core.' };
    return { ok: true, greeting: JSON.parse(init.body).greeting };
  };
  const contribution = await createSettingsContribution({ api, agents: [{ id: 'hatchet' }] });
  assert.equal(contribution.sections[0].layout, 'activity');
  assert.equal(contribution.sections[0].items[0].detail, 'Hello from Core.');
  assert.equal(contribution.sections[0].items[1].meta, '1');
  assert.equal(await handleSettingsAction('acknowledge', {}), undefined);
  assert.equal(calls.length, 1);
  await assert.rejects(handleSettingsAction('other', {}), /unknown_settings_action/);
});
