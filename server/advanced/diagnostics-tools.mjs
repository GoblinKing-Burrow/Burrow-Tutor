const DIAGNOSTIC_OPERATIONS = new Set([
  'session',
  'session-context',
  'context-status',
  'active-runs',
  'traces',
  'trace',
  'trace-authority',
]);
const issued = new Map();

function sameCaller(left, right) {
  return left?.agentId === right?.agentId && (left?.sessionId || 'default') === (right?.sessionId || 'default')
    && (left?.conversationId || null) === (right?.conversationId || null);
}
function diagnosticInput(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || !DIAGNOSTIC_OPERATIONS.has(args.operation)) throw new Error('invalid_arguments');
  const allowedByOperation = {
    session: new Set(['operation', 'sessionId', 'limit', 'maxContentChars']),
    'session-context': new Set(['operation', 'sessionId']),
    'context-status': new Set(['operation', 'sessionId']),
    'active-runs': new Set(['operation', 'sessionId']),
    traces: new Set(['operation', 'sessionId', 'limit', 'cursor']),
    trace: new Set(['operation', 'sessionId', 'runId', 'includeToolOutput']),
    'trace-authority': new Set(['operation', 'sessionId', 'runId']),
  };
  if (Object.keys(args).some((key) => !allowedByOperation[args.operation].has(key))) throw new Error('invalid_arguments');
  for (const [key, max] of [['sessionId', 128], ['runId', 256], ['cursor', 8192]]) {
    if (args[key] !== undefined && (typeof args[key] !== 'string' || !args[key] || args[key].length > max)) throw new Error('invalid_arguments');
  }
  for (const key of ['limit', 'maxContentChars']) {
    if (args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key] < 1 || (key === 'limit' && args[key] > 100))) throw new Error('invalid_arguments');
  }
  if (args.includeToolOutput !== undefined && typeof args.includeToolOutput !== 'boolean') throw new Error('invalid_arguments');
  if ((args.operation === 'trace' || args.operation === 'trace-authority') && !args.runId) throw new Error('invalid_arguments');
  return { ...args };
}

/** Opt-in read-only diagnostic adapter. Core sanitizes this output again. */
export function registerDiagnosticAdapter(context) {
  context.diagnostics.register({
    async listJobs({ limit, cursor }) {
      const page = await context.scheduler.list({ limit, ...(cursor ? { cursor } : {}) });
      return {
        jobs: page.jobs.map((job) => ({
          id: job.id, kind: 'scheduled-job', status: job.enabled ? 'enabled' : 'disabled',
          createdAt: job.createdAt, updatedAt: job.updatedAt,
          completeness: 'summary', resumable: true,
        })),
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    },
    async getJob(id) {
      try {
        const job = await context.scheduler.read(id);
        return { id: job.id, kind: 'scheduled-job', status: job.enabled ? 'enabled' : 'disabled', createdAt: job.createdAt, updatedAt: job.updatedAt, completeness: 'summary', resumable: true };
      } catch (error) {
        if (error?.message === 'scheduled_job_not_found') return null;
        throw error;
      }
    },
  });
}

/** Advanced tool examples remain separate from the beginner greeting tool. */
export function registerAdvancedTools(context) {
  context.tools.register({
    name: 'reference_self_diagnostics',
    description: 'Read a bounded Core runtime diagnostic for the calling agent and session only.',
    availability: 'mod-authorized',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        operation: { type: 'string', enum: [...DIAGNOSTIC_OPERATIONS] },
        sessionId: { type: 'string', minLength: 1, maxLength: 128 },
        runId: { type: 'string', minLength: 1, maxLength: 256 },
        includeToolOutput: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        maxContentChars: { type: 'integer', minimum: 1 },
        cursor: { type: 'string', minLength: 1, maxLength: 8192 },
      },
      required: ['operation'],
    },
    async handler(args, caller) {
      // Product authorization: this tool accepts no agentId. Core binds every
      // read to the trusted caller, so model arguments cannot request another agent.
      return context.runtimeDiagnostics.read(diagnosticInput(args), { signal: caller.signal });
    },
  });

  context.tools.register({
    name: 'reference_sensitive_secret',
    description: 'Demonstrate a one-turn sensitive result using the configured reference secret.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async handler(args) {
      if (!args || Object.keys(args).length) throw new Error('invalid_arguments');
      const secret = await context.secrets.get('example-secret');
      if (typeof secret !== 'string' || !secret) throw new Error('example_secret_not_configured');
      return { secret: { $burrowSensitive: { type: 'secret', value: secret } } };
    },
  });

  context.tools.register({
    name: 'reference_protected_secret',
    description: 'Return the optional reference secret as a short-lived managed protected value.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async handler(args, caller) {
      if (!args || Object.keys(args).length) throw new Error('invalid_arguments');
      if (!await context.secrets.has('example-secret')) throw new Error('example_secret_not_configured');
      const reference = `example-${crypto.randomUUID()}`;
      const version = crypto.randomUUID();
      issued.set(reference, { version, caller: { agentId: caller.agentId, sessionId: caller.sessionId || 'default', conversationId: caller.conversationId || null }, expiresAt: Date.now() + 60_000 });
      return { secret: { $burrowManaged: { type: 'secret', reference, version, lifetimeMs: 60_000 } } };
    },
    async resolveProtectedReference(reference, caller) {
      const record = issued.get(reference);
      if (!record || record.expiresAt <= Date.now() || record.version !== caller?.version || !sameCaller(record.caller, caller)) throw new Error('protected_reference_denied');
      issued.delete(reference); // this teaching example deliberately permits one resolution
      const secret = await context.secrets.get('example-secret');
      if (typeof secret !== 'string' || !secret) throw new Error('protected_reference_denied');
      return secret;
    },
  });
}

export function clearAdvancedToolState() { issued.clear(); }
