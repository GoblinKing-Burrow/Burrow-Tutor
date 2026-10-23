const ENABLED_SETTING = 'advanced-external-agent-turns-enabled';
const REQUEST_PREFIX = 'advanced-external-agent-turn:';
const inFlight = new Set();

const response = (status, body) => ({ status, headers: { 'cache-control': 'no-store' }, body });
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (code = 'agent_turn_request_invalid', statusCode = 400) => { throw Object.assign(new Error(code), { statusCode }); };
const bounded = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value : invalid();
const requestId = (value) => {
  const id = bounded(value, 96).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) invalid();
  return id;
};
const keyFor = (id) => `tutor-agent-turn:${id}`;
const settingFor = (id) => `${REQUEST_PREFIX}${id}`;

function requireOperator(request) {
  if (request?.auth?.enabled !== false && request?.auth?.authenticated !== true) invalid('operator_authentication_required', 401);
}
function exact(value, allowed) {
  if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid();
  return value;
}
function failure(error) {
  const publicStatus = new Map([
    ['operator_authentication_required', 401], ['agent_turn_request_invalid', 400],
    ['agent_turn_dispatch_disabled', 403], ['agent_turn_submission_busy', 409],
    ['agent_turn_request_conflict', 409], ['agent_not_found', 404], ['agent_disabled', 409],
    ['mod_external_turn_idempotency_conflict', 409], ['mod_external_turn_not_found', 404],
  ]);
  return response(publicStatus.get(error?.message) || 503, { ok: false, error: publicStatus.has(error?.message) ? error.message : 'agent_turn_capability_failed' });
}

/**
 * Disabled-by-default, operator-triggered external-turn lesson.
 *
 * This deliberately retains one durable intent/receipt per caller-supplied
 * requestId. Submission waits only for Core's durable acceptance receipt; model
 * completion is observed through the separate GET route.
 */
export function registerExternalAgentTurnRoutes(context) {
  context.api.get('/advanced/agent-turns/status', async (request) => {
    try {
      requireOperator(request);
      return response(200, {
        ok: true,
        enabled: await context.settings.get(ENABLED_SETTING, false) === true,
        agents: await context.agents.list(),
      });
    } catch (error) { return failure(error); }
  });

  context.api.put('/advanced/agent-turns/configuration', async (request) => {
    try {
      requireOperator(request);
      const body = exact(request.body, ['enabled']);
      if (typeof body.enabled !== 'boolean') invalid();
      await context.settings.set(ENABLED_SETTING, body.enabled);
      return response(200, { ok: true, enabled: body.enabled });
    } catch (error) { return failure(error); }
  });

  context.api.post('/advanced/agent-turns', async (request) => {
    let lockedId = null;
    try {
      requireOperator(request);
      if (await context.settings.get(ENABLED_SETTING, false) !== true) invalid('agent_turn_dispatch_disabled', 403);
      const body = exact(request.body, ['requestId', 'agentId', 'sessionId', 'message', 'confirmDispatch']);
      if (body.confirmDispatch !== true) invalid();
      const id = requestId(body.requestId);
      if (inFlight.has(id)) invalid('agent_turn_submission_busy', 409);
      inFlight.add(id); lockedId = id;
      const setting = settingFor(id);
      let retained = await context.settings.get(setting, null);
      if (retained) {
        for (const name of ['agentId', 'sessionId', 'message']) {
          if (body[name] !== undefined && body[name] !== retained[name]) invalid('agent_turn_request_conflict', 409);
        }
      } else {
        retained = {
          agentId: bounded(body.agentId, 96).trim(),
          sessionId: bounded(body.sessionId, 128).trim(),
          message: bounded(body.message, 100_000),
          idempotencyKey: keyFor(id),
          turnId: null,
        };
        // Intent precedes dispatch so an ambiguous failure can reuse this key.
        await context.settings.set(setting, retained);
      }
      const accepted = await context.agents.turns.submit({
        agentId: retained.agentId,
        sessionId: retained.sessionId,
        message: retained.message,
        idempotencyKey: retained.idempotencyKey,
      });
      await context.settings.set(setting, { ...retained, turnId: accepted.turn.id });
      return response(202, { ok: true, turn: accepted.turn, replayed: accepted.replayed });
    } catch (error) { return failure(error); }
    finally { if (lockedId) inFlight.delete(lockedId); }
  });

  context.api.get('/advanced/agent-turns/:requestId', async (request) => {
    try {
      requireOperator(request);
      const id = requestId(request.params?.requestId);
      const retained = await context.settings.get(settingFor(id), null);
      if (!retained) return response(404, { ok: false, error: 'agent_turn_request_not_found' });
      if (!retained.turnId) return response(200, { ok: true, retryPending: true, turn: null });
      return response(200, { ok: true, retryPending: false, turn: await context.agents.turns.read(retained.turnId) });
    } catch (error) { return failure(error); }
  });
}
