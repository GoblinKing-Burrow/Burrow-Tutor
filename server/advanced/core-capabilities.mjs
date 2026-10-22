const json = (status, body) => ({ status, headers: { 'cache-control': 'no-store' }, body });

class InputError extends Error {
  constructor(code, statusCode = 400) { super(code); this.statusCode = statusCode; }
}
const fail = (code, statusCode) => { throw new InputError(code, statusCode); };
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('advanced_input_invalid');
const exact = (value, allowed) => {
  const input = plain(value);
  if (Object.keys(input).some((key) => !allowed.includes(key))) fail('advanced_input_invalid');
  return input;
};
const bounded = (value, max, { optional = false } = {}) => {
  if (optional && (value === undefined || value === null || value === '')) return undefined;
  if (typeof value !== 'string' || !value || value.length > max) fail('advanced_input_invalid');
  return value;
};
const booleanQuery = (value, fallback) => {
  if (value === undefined) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  fail('advanced_input_invalid');
};
const limit = (value, fallback = 50) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) fail('advanced_input_invalid');
  return parsed;
};
function requireOperator(request) {
  if (request?.auth?.enabled !== false && request?.auth?.authenticated !== true) fail('operator_authentication_required', 401);
}
function route(handler) {
  return async (request) => {
    try { requireOperator(request); return await handler(request); }
    catch (error) {
      const expected = error instanceof InputError;
      return json(expected ? error.statusCode : 500, { ok: false, error: expected ? error.message : 'advanced_request_failed' });
    }
  };
}

/** Runnable examples for ordinary read/model/scheduler capabilities.
 * Every route is operator-only and validates an exact product payload before
 * forwarding to Core. Model generation requires an explicit paid-work flag.
 */
export function registerCoreCapabilityRoutes(context) {
  context.api.get('/advanced/identity', route(async () => json(200, {
    ok: true,
    modId: context.id,
    operator: await context.operator.displayIdentity(),
    timezone: (await context.operator.timezone()).timezone,
    agents: await context.agents.list(),
  })));

  context.api.get('/advanced/conversations', route(async (request) => {
    const query = request.query || {};
    const input = {
      agentId: bounded(query.agentId, 96),
      limit: limit(query.limit),
      includeArchived: booleanQuery(query.includeArchived, true),
      ...(bounded(query.cursor, 8192, { optional: true }) ? { cursor: query.cursor } : {}),
    };
    return json(200, { ok: true, ...await context.conversations.list(input) });
  }));

  context.api.post('/advanced/conversations/read', route(async (request) => {
    const input = exact(request.body, ['agentId', 'sessionId', 'archiveId', 'limit', 'before', 'from', 'to']);
    const normalized = {
      agentId: bounded(input.agentId, 96),
      sessionId: bounded(input.sessionId, 128),
      limit: limit(input.limit),
    };
    for (const [name, max] of [['archiveId', 256], ['before', 8192], ['from', 64], ['to', 64]]) {
      const value = bounded(input[name], max, { optional: true });
      if (value !== undefined) normalized[name] = value;
    }
    return json(200, { ok: true, ...await context.conversations.read(normalized) });
  }));

  context.api.get('/advanced/models', route(async () => json(200, { ok: true, models: await context.models.list() })));

  context.api.post('/advanced/models/generate', route(async (request) => {
    const input = exact(request.body, ['connectionId', 'model', 'prompt', 'maxTokens', 'effort', 'temperature', 'confirmPaid']);
    if (input.confirmPaid !== true) fail('paid_confirmation_required');
    const generation = {
      connectionId: bounded(input.connectionId, 128),
      model: bounded(input.model, 256),
      prompt: bounded(input.prompt, 100_000),
    };
    if (input.maxTokens !== undefined) {
      if (!Number.isSafeInteger(input.maxTokens) || input.maxTokens < 1) fail('advanced_input_invalid');
      generation.maxTokens = input.maxTokens;
    }
    if (input.effort !== undefined) generation.effort = bounded(input.effort, 32);
    if (input.temperature !== undefined) {
      if (typeof input.temperature !== 'number' || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) fail('advanced_input_invalid');
      generation.temperature = input.temperature;
    }
    return json(200, { ok: true, ...await context.models.generateText(generation) });
  }));

  context.api.get('/advanced/scheduler/jobs', route(async (request) => {
    const query = request.query || {};
    return json(200, { ok: true, ...await context.scheduler.list({
      limit: limit(query.limit),
      ...(bounded(query.cursor, 512, { optional: true }) ? { cursor: query.cursor } : {}),
      ...(query.enabled === undefined ? {} : { enabled: booleanQuery(query.enabled) }),
    }) });
  }));
  context.api.get('/advanced/scheduler/jobs/:jobId', route(async (request) => json(200, {
    ok: true, job: await context.scheduler.read(bounded(request.params?.jobId, 96)),
  })));
  context.api.post('/advanced/scheduler/jobs', route(async (request) => {
    const input = exact(request.body, ['agentId', 'name', 'prompt', 'cron', 'sessionId', 'enabled', 'modelConnectionId', 'model']);
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') fail('advanced_input_invalid');
    const job = {
      agentId: bounded(input.agentId, 96), name: bounded(input.name, 160), prompt: bounded(input.prompt, 100_000), cron: bounded(input.cron, 128),
      ...(bounded(input.sessionId, 128, { optional: true }) ? { sessionId: input.sessionId } : {}),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    };
    const connection = bounded(input.modelConnectionId, 128, { optional: true });
    const model = bounded(input.model, 256, { optional: true });
    if (Boolean(connection) !== Boolean(model)) fail('advanced_input_invalid');
    if (connection) Object.assign(job, { modelConnectionId: connection, model });
    return json(201, { ok: true, job: await context.scheduler.create(job) });
  }));
  context.api.patch('/advanced/scheduler/jobs/:jobId', route(async (request) => {
    const input = exact(request.body, ['name', 'prompt', 'cron', 'sessionId', 'enabled', 'modelConnectionId', 'model']);
    if (!Object.keys(input).length || input.enabled !== undefined && typeof input.enabled !== 'boolean') fail('advanced_input_invalid');
    const patch = {};
    for (const [name, max] of [['name', 160], ['prompt', 100_000], ['cron', 128], ['sessionId', 128]]) {
      if (input[name] !== undefined) patch[name] = bounded(input[name], max);
    }
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    const hasConnection = Object.hasOwn(input, 'modelConnectionId');
    const hasModel = Object.hasOwn(input, 'model');
    if (hasConnection !== hasModel) fail('advanced_input_invalid');
    if (hasConnection) {
      if (input.modelConnectionId === null && input.model === null) Object.assign(patch, { modelConnectionId: null, model: null });
      else Object.assign(patch, { modelConnectionId: bounded(input.modelConnectionId, 128), model: bounded(input.model, 256) });
    }
    return json(200, { ok: true, job: await context.scheduler.update(bounded(request.params?.jobId, 96), patch) });
  }));
  context.api.delete('/advanced/scheduler/jobs/:jobId', route(async (request) => json(200, {
    ok: true, job: await context.scheduler.delete(bounded(request.params?.jobId, 96)),
  })));
  context.api.get('/advanced/scheduler/jobs/:jobId/runs', route(async (request) => json(200, {
    ok: true,
    ...await context.scheduler.runs(bounded(request.params?.jobId, 96), {
      limit: limit(request.query?.limit),
      ...(bounded(request.query?.cursor, 512, { optional: true }) ? { cursor: request.query.cursor } : {}),
    }),
  })));
  context.api.post('/advanced/scheduler/jobs/:jobId/trigger', route(async (request) => json(202, {
    ok: true, receipt: await context.scheduler.trigger(bounded(request.params?.jobId, 96)),
  })));
}
