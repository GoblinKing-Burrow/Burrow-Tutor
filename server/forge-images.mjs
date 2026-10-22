import { createHash } from 'node:crypto';

const ENABLED_KEY = 'forge-images-enabled';
const REQUEST_PREFIX = 'forge-image-request:';

class ImageRequestError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode = 400) {
  throw new ImageRequestError(code, statusCode);
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !keys.includes(key))) fail('image_input_invalid');
  return value;
}

function requireOperator(request) {
  // Core supplies auth, never accept identity/authorization from request.body.
  if (request?.auth?.enabled !== false && request?.auth?.authenticated !== true) {
    fail('operator_authentication_required', 401);
  }
}

function response(status, body) {
  return { status, headers: { 'cache-control': 'no-store' }, body };
}

function route(handler) {
  return async (request) => {
    try {
      requireOperator(request);
      return await handler(request);
    } catch (error) {
      // Do not relay raw provider errors, prompts, or configuration to the UI.
      const expected = error instanceof ImageRequestError;
      return response(expected ? error.statusCode : 500, {
        ok: false,
        error: expected ? error.message : 'image_request_failed',
      });
    }
  };
}

/**
 * Optional ordinary-mod scaffold; no privileged manifest declaration is needed.
 * Disabled by default. This example supplies operator-only routes, not agent tools.
 * The mod owns product consent; Core owns saved image selection and paid dispatch.
 */
export function registerForgeImageRoutes(context) {
  const pending = new Map();
  // Serialize equal request IDs in this host, including writes to durable settings.
  // A multi-writer product needs transactional intent storage instead.
  async function serialized(requestId, handler) {
    const previous = pending.get(requestId) || Promise.resolve();
    const operation = previous.catch(() => {}).then(handler);
    pending.set(requestId, operation);
    try { return await operation; }
    finally { if (pending.get(requestId) === operation) pending.delete(requestId); }
  }

  context.api.get('/images/status', route(async () => response(200, {
    ok: true,
    enabled: await context.settings.get(ENABLED_KEY, false) === true,
    ...await context.forge.images.status(), // { available, reason? }, no model IDs
  })));

  context.api.put('/images/configuration', route(async (request) => {
    const { enabled } = exactObject(request.body, ['enabled']);
    if (typeof enabled !== 'boolean') fail('image_input_invalid');
    await context.settings.set(ENABLED_KEY, enabled);
    return response(200, { ok: true, enabled });
  }));

  context.api.post('/images', route(async (request) => {
    const input = exactObject(request.body, ['requestId', 'prompt', 'confirmPaid']);
    if (input.confirmPaid !== true) fail('paid_confirmation_required');
    if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.requestId)) fail('image_input_invalid');
    // These are this example product's input limits, not a universal Core limit.
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 10_000) fail('image_input_invalid');
    const prompt = input.prompt.trim();
    const promptHash = createHash('sha256').update(prompt).digest('hex');
    return serialized(input.requestId, async () => {
      if (await context.settings.get(ENABLED_KEY, false) !== true) fail('images_disabled', 403);
      const recordKey = `${REQUEST_PREFIX}${input.requestId}`;
      const prior = await context.settings.get(recordKey, null);
      if (prior && prior.promptHash !== promptHash) fail('image_request_conflict', 409);
      if (prior?.jobId) {
        return response(202, { ok: true, job: await context.forge.jobs.read(prior.jobId), replayed: true });
      }
      const status = await context.forge.images.status();
      if (!status.available) fail('images_unavailable', 503);
      // Save intent BEFORE paid dispatch. Retries/reloads reuse exactly this key.
      // Never generate a new key per HTTP retry or use the prompt alone as a key.
      if (!prior) await context.settings.set(recordKey, { promptHash, jobId: null });
      const receipt = await context.forge.images.create({
        prompt,
        idempotencyKey: `image:${input.requestId}`, // Core adds the installed mod ID
      });
      // Persist the receipt before replying; a lost reply can be recovered by retry.
      await context.settings.set(recordKey, { promptHash, jobId: receipt.job.id });
      return response(202, { ok: true, ...receipt });
    });
  }));

  context.api.get('/images/jobs/:jobId', route(async (request) => {
    const jobId = request.params?.jobId;
    if (typeof jobId !== 'string' || !jobId || jobId.length > 96) fail('image_input_invalid');
    // Core checks same-mod image ownership. Never poll to completion in this route.
    return response(200, { ok: true, job: await context.forge.jobs.read(jobId) });
  }));
}
