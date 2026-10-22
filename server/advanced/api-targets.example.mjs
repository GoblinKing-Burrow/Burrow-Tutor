// Standalone advanced example for the host-owned contributions.apiTargets seam.
// Do not activate it unless your product genuinely contributes remote Burrow API
// targets. Core owns rendering/routing; this module owns validated target records.
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY = 'advanced-api-targets';
const response = (status, body) => ({ status, headers: { 'cache-control': 'no-store' }, body });
function requireOperator(request) {
  if (request?.auth?.enabled !== false && request?.auth?.authenticated !== true) throw Object.assign(new Error('operator_authentication_required'), { statusCode: 401 });
}
function target(value, expectedId = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['id', 'name', 'baseUrl', 'enabled'].includes(key))) throw Object.assign(new Error('api_target_invalid'), { statusCode: 400 });
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.baseUrl !== 'string' || typeof value.enabled !== 'boolean') throw Object.assign(new Error('api_target_invalid'), { statusCode: 400 });
  const id = value.id.trim();
  const name = value.name.trim();
  if (!ID.test(id) || id === 'local' || id !== (expectedId || id) || !name) throw Object.assign(new Error('api_target_invalid'), { statusCode: 400 });
  let url;
  try { url = new URL(value.baseUrl); } catch { throw Object.assign(new Error('api_target_invalid'), { statusCode: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Object.assign(new Error('api_target_invalid'), { statusCode: 400 });
  return { id, name, baseUrl: url.toString().replace(/\/$/, ''), enabled: value.enabled };
}
function route(handler) {
  return async (request) => {
    try { requireOperator(request); return await handler(request); }
    catch (error) { return response(Number(error?.statusCode) || 500, { ok: false, error: Number(error?.statusCode) ? error.message : 'api_target_operation_failed' }); }
  };
}

export function registerApiTargetExample(context) {
  const read = async () => {
    const value = await context.settings.get(KEY, []);
    return Array.isArray(value) ? value : [];
  };
  context.api.get('/advanced/targets', route(async () => response(200, { ok: true, targets: await read() })));
  context.api.post('/advanced/targets', route(async (request) => {
    const next = target(request.body); const targets = await read();
    if (targets.some((item) => item.id === next.id)) return response(409, { ok: false, error: 'api_target_exists' });
    await context.settings.set(KEY, [...targets, next]);
    return response(201, { ok: true, target: next });
  }));
  context.api.put('/advanced/targets/:id', route(async (request) => {
    const next = target(request.body, String(request.params?.id || '')); const targets = await read();
    if (!targets.some((item) => item.id === next.id)) return response(404, { ok: false, error: 'api_target_not_found' });
    await context.settings.set(KEY, targets.map((item) => item.id === next.id ? next : item));
    return response(200, { ok: true, target: next });
  }));
  context.api.delete('/advanced/targets/:id', route(async (request) => {
    const id = String(request.params?.id || ''); const targets = await read();
    if (!ID.test(id) || id === 'local') return response(400, { ok: false, error: 'api_target_invalid' });
    await context.settings.set(KEY, targets.filter((item) => item.id !== id));
    return response(200, { ok: true });
  }));
}
