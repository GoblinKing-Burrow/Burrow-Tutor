# Owner-scoped scheduler jobs

[Advanced index](index.md) · [Runnable routes](../../server/advanced/core-capabilities.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs) · [Authoritative contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

Use Core's scheduler for recurring agent work; do not build a private recurring `setInterval` loop in a mod host.

```js
const job = await context.scheduler.create({
  agentId: 'hatchet',
  name: 'Morning lesson',
  prompt: 'Prepare today’s lesson.',
  cron: '0 8 * * *',
  enabled: false,
  // Optional pair: modelConnectionId, model
});
```

Core binds `ownerModId` from the installed host. A mod cannot choose the owner or job ID. Every `list`, `read`, `update`, `delete`, `runs`, and `trigger` is owner-scoped; a foreign job is indistinguishable from a missing one. This is installation ownership, not per-user authorization—your routes must still enforce product access.

Jobs are disabled by default. Prefer create-disabled, show the operator the exact agent/prompt/schedule, then explicitly enable. All jobs use the operator timezone; legacy `timezone` payload fields are ignored. `modelConnectionId` and `model` must be supplied together. On update, set both to `null` to clear an override; Core uses the same selected-model validation as operator jobs.

## Read, page, update, and trigger

```js
let cursor;
do {
  const page = await context.scheduler.list({
    limit: 100, enabled: true, ...(cursor ? { cursor } : {}),
  });
  consume(page.jobs);
  cursor = page.hasMore ? page.nextCursor : null;
} while (cursor);

const current = await context.scheduler.read(job.id);
const changed = await context.scheduler.update(job.id, { enabled: true });
const receipt = await context.scheduler.trigger(job.id);

let runCursor;
do {
  const page = await context.scheduler.runs(job.id, {
    limit: 100, ...(runCursor ? { cursor: runCursor } : {}),
  });
  consumeRuns(page.runs);
  runCursor = page.hasMore ? page.nextCursor : null;
} while (runCursor);
```

Lists default to 50 and cap at 100. Cursors are opaque; repeat the same filter and follow `nextCursor` only while `hasMore` is true. Scheduler pages are not documented as immutable snapshots, so consumers that need durable export must tolerate live changes and deduplicate stable IDs.

Manual trigger uses the shared scheduler. A 202-style Tutor route response means accepted/receipted, not that an agent run succeeded. Inspect run history later. Delete responses should likewise be treated according to Core's returned record, not as proof that previously dispatched work was undone.

Tutor supplies operator-only JSON routes for all seven operations:

- `GET/POST /advanced/scheduler/jobs`
- `GET/PATCH/DELETE /advanced/scheduler/jobs/:jobId`
- `GET /advanced/scheduler/jobs/:jobId/runs`
- `POST /advanced/scheduler/jobs/:jobId/trigger`

Use the scoped UI `api` helper, so these paths remain beneath `/api/mods/burrow-reference-mod`.

## Validate against the real store

Core's persistent scheduler also validates cron syntax, limits prompts to 20,000 characters, and restricts session IDs to 1–96 letters, digits, dots, underscores, or hyphens. Tutor's adapter has looser length checks (100,000 for prompts and 128 for session IDs). Values between those limits, invalid cron, or invalid session-ID characters can pass the example adapter but fail in Core; the example maps that unexpected rejection to `500 advanced_request_failed`.

Keep inputs within Core's limits and add store-backed negative tests when adapting this example. The lightweight integration scheduler fixture does not establish production PostgreSQL validation behavior.

## Lifecycle, recovery, and failure

`enabled` is durable scheduling intent, not evidence that the owner is running. A mod-owned job dispatches only while that exact mod is loaded and healthy. Disabled, crashed/failed, uninstalled, undiscovered, or not-yet-loaded owners are ineligible; schedules remain pending. Normal claiming resumes when the owner loads again. Manual trigger enforces ownership and current owner availability.

A route timeout, host reload, or failed response is not proof that a create/update/trigger had no effect. Read/list by the identifiers you retained before blindly retrying mutations. The ordinary scheduler API does not advertise idempotency keys or per-call cancellation. Design product-level duplicate prevention where repeated submissions matter.

Do not place secrets in job names/prompts unless the scheduler/agent workflow is explicitly designed to hold them. Capability errors reject; Tutor maps unexpected failures to `advanced_request_failed` rather than leaking internals.

## Boundary

Owner scoping cannot be overridden by body fields, tool arguments, installation, or MCP grants. Operator-owned jobs (`ownerModId: null`) and another mod's jobs are outside this facade. `context.modManagement` is a separate privileged capability and is neither required nor granted here.

## Verify

`test/advanced-capabilities.test.mjs` verifies owner fields are not accepted, jobs default disabled, model selectors are paired, and trigger returns promptly. Archive UI tests exercise a list consumer. `npm run test:core` executes create/list/read/update/run-history/trigger/delete through Tutor's forked host and current Core owner-scoped scheduler capability using controlled durable-store semantics. Foreign-owner isolation, cursor limits, selected-model rejection, operator-timezone inheritance during dispatch, and unavailable-owner behavior remain focused gaps. See [coverage](coverage.md).
