# Diagnostics: mod adapters and tool-scoped runtime reads

[Advanced index](index.md) · [Runnable source](../../server/advanced/diagnostics-tools.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs)

Burrow has two different ordinary-mod diagnostic directions. Keep them separate:

1. a mod can opt in to expose a sanitized view of **its own jobs** to Core diagnostics;
2. an active mod tool can request a sanitized, caller-scoped view of **Core runtime state**.

The Core source contracts are `docs/mod-host-capabilities.md` (opt-in diagnostics) and `docs/runtime-mod-diagnostics.md` (tool-scoped reads). The [coverage matrix](coverage.md) records the reviewed Core source and exact verification limits; the [public Tutor contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md) provides the ordinary-mod overview.

## Expose mod-owned jobs

Register once during activation:

```js
context.diagnostics.register({
  async listJobs({ limit, cursor }) {
    const page = await context.scheduler.list({ limit, ...(cursor ? { cursor } : {}) });
    return {
      jobs: page.jobs.map(projectJob),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
  async getJob(id) {
    try { return projectJob(await context.scheduler.read(id)); }
    catch (error) {
      if (error?.message === 'scheduled_job_not_found') return null;
      throw error;
    }
  },
});
```

Tutor's `projectJob` output contains only ID, kind, enabled/disabled status, timestamps, completeness, and resumability. Core validates and projects the result again. Supported fields are typed IDs/status/phase/timestamps, bounded counters/progress, completeness, and resumability. Prompts, settings, errors, transcript content, secrets, and arbitrary events are never exposed.

Handlers must be genuinely read-only. Do not “repair,” resume, trigger, or persist status while servicing a diagnostic read. Pages default to 50 and cap at 100; never return more than requested, and use an opaque cursor of at most 256 characters. Detail returns a job or `null`.

Core's dedicated diagnostics endpoints report:

- no registration: `unsupported`;
- disabled/failed/unloaded mod: `unavailable`, not an empty job list;
- adapter error/invalid result: `unavailable` with diagnostic error state.

Only the dedicated `GET /api/diagnostics/mods...` endpoints accept `diagnostics:read` bearer tokens. An arbitrary `context.api.get` route does not become diagnostic or bearer-authorized because it is read-only. `/pending` reports current Core-hosted capability operations and elapsed time; presence is not material progress or liveness proof.

## Read Core runtime diagnostics from a tool

`context.runtimeDiagnostics.read` is available **only while an active mod tool invocation is handling the request**. Activation, HTTP routes, background work, and detached promises have no diagnostic caller identity and fail closed.

Tutor registers a self-scoped tool with operation-specific optional fields:

```js
context.tools.register({
  name: 'reference_self_diagnostics',
  availability: 'mod-authorized',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      operation: { type: 'string', enum: [
        'session', 'session-context', 'context-status', 'active-runs',
        'traces', 'trace', 'trace-authority'
      ] },
      sessionId: { type: 'string' },
      runId: { type: 'string' },
      includeToolOutput: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      maxContentChars: { type: 'integer', minimum: 1 },
      cursor: { type: 'string' },
    },
    required: ['operation'],
  },
  async handler(args, caller) {
    // Tutor first applies exact operation-specific validation. It accepts no
    // agentId; Core therefore scopes every read to the trusted caller.
    return context.runtimeDiagnostics.read(validatedDiagnosticInput(args), {
      signal: caller.signal,
    });
  },
});
```

Tutor demonstrates structural self-scoping by accepting no target agent ID. That is the full policy of this deliberately small example; a production `mod-authorized` tool still must implement an explicit per-agent/per-record eligibility policy and filter discovery/use. Core binds caller identity from the live invocation, not arguments.

Available Core operations include:

- `session`: bounded newest chat tail (default 50, max 100) with configurable preview size; **not complete history**;
- `session-context` / `context-status`: scalar capacity, recall, evidence, compaction, and meter summaries—not prompts or summary bodies;
- `active-runs`: sanitized run/subagent identity, state, times, lineage, and counts—not messages, result/error bodies, steering, or child purpose;
- `traces`: descending run-ID keyset inventory, default 50/max 100, live rather than snapshot;
- `trace` and `trace-authority`: valid `runId` detail operations. Tutor exposes both and permits `includeToolOutput` only for `trace`.

A missing trace can be `exists: false`; unavailable trace authority is never approval. Invalid options fail with `invalid_diagnostics_query`. Use `conversations.read` for complete history, not the diagnostic `session` tail.

Agent-owned operations default to the trusted calling agent. Cross-agent targets require the operator-managed `diagnosticAgentIds` global scope for that mod; arguments, MCP grants, `availability: 'mod-authorized'`, and legacy mod settings cannot grant it. Installation-wide job records without agent ownership also require global scope.

## Cancellation and lifecycle

Pass `caller.signal` as Tutor does. Tool cancellation or host shutdown aborts the nested request; do not detach it. Runtime diagnostics disappear with the active invocation identity. Adapter registration and tool registration happen during activation, and live routing is revoked when the mod stops.

## Boundary

Neither diagnostic interface is arbitrary SQL, filesystem access, an HTTP proxy, or privileged mod management. `mod-management-v1` administrator IDs and diagnostic global IDs are separate operator-owned policies.

## Verify

`test/advanced-capabilities.test.mjs` checks read-only scheduler projection, operation-specific validation including trace detail, `mod-authorized` registration, caller-scoped input, and signal forwarding. `npm run test:core` invokes `context-status` through Tutor's actual forked host and current Core capability service while preserving trusted caller scope. Dedicated diagnostic HTTP endpoints, Core's production diagnostic implementation, pagination, global-scope denial, cancellation, and unavailable-state integration remain gaps in [coverage](coverage.md).
