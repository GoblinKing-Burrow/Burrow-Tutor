# Agents and operator metadata

[Advanced index](index.md) · [Runnable source](../../server/advanced/core-capabilities.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs)

Ordinary server mods can enumerate Burrow agents and read two small pieces of operator presentation/configuration data. The authoritative contract is Core's [generic capabilities](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities). These reads are not an administrator API.

```js
const agents = await context.agents.list();
// [{ id, name, enabled }]
const operator = await context.operator.displayIdentity();
// { id, name } -- name is a string or null
const { timezone } = await context.operator.timezone();
```

Tutor combines them in the operator-only `GET /advanced/identity` route:

```js
context.api.get('/advanced/identity', route(async () => ({
  ok: true,
  modId: context.id,
  operator: await context.operator.displayIdentity(),
  timezone: (await context.operator.timezone()).timezone,
  agents: await context.agents.list(),
})));
```

Use `context.id`, not a request parameter, as the installed mod identity. The agent list includes only the bounded identity, display name, and enabled state. Mod-owned identities appear only when their `visibility.agents` flag is true. It is useful for a picker; it does not grant authority to act as an agent, expose its workspace, or start a disabled runtime. Validate a selected ID again at the capability that consumes it.

`displayIdentity()` exposes the stable display ID and configured display name only. It does **not** expose avatar data, profile documents, preferences, authentication identity, secrets, or authorization. It is presentation metadata, not proof that an HTTP caller is the operator. For routes, use Core's trusted `request.auth` and your product's authorization policy; never accept identity from body, query, forwarded headers, or tool arguments.

`timezone()` returns Core's operator timezone. Scheduler evaluation already uses that timezone; legacy scheduler `timezone` payload fields are ignored. Displaying it can explain a cron schedule, but a mod cannot change it through this interface.

## Mod-owned agents and per-turn context

Current Core also exposes `context.agents.owned.list()`, `.read(agentId)`, `.create(input)`, and `.update(agentId, patch)`, plus `context.agents.context.register(provider)` during activation. These are separate from the read-only picker above. Core supplies the owner from the installed mod, and the owned-agent methods cannot adopt a regular agent or another mod's agent. Creation requires `id`, `name`, `modelConnectionId`, and `model`, with an authenticated, enabled native model selection; identity and selection are saved atomically.

Optional `capabilities` flags are `a2a`, `forge`, `brains`, `mcp`, and `skills`; `visibility` flags are `agents` and `chat`. Omitted flags default false on creation and remain unchanged in an update patch. These records do not create engineering profiles, workspaces, or a Dream cycle, and do not by themselves establish runtime support for a capability.

A registered provider receives `({agentId, sessionId}, {signal})` for each dependent turn and returns `{profileFiles, context}`. Both collections contain `{name, content}` string records. Names are bounded, non-path identifiers, unique within their collection; each collection allows at most 64 records, with at most 1,000,000 UTF-8 bytes overall. Invalid/excess output is rejected rather than truncated. The `sessionId` is the logical conversation, including scheduled turns, not an internal isolated execution ID. The live owning host supplies cancellation and its configured route timeout; a missing, disabled, replaced or failing provider blocks the dependent turn with `mod_agent_unavailable`. Regular agents do not require a provider.

Owned portraits use `context.agents.owned.referenceImages.get(agentId)`, `.put(agentId, {fileName, content})`, and `.remove(agentId)`. They share Core's native agent reference-image store; `content` is a PNG/JPEG/WebP data URL and the original bytes are retained. These APIs are owner-scoped, not a general agent editor.

Tutor has no runnable owned-agent/context-provider/portrait example or integration assertion for these APIs. This is a source-backed host contract note, not a claim that the Beginner or Advanced lab implements them. See the [coverage gaps](coverage.md#explicit-tutor-documentation-only-surfaces-and-real-gaps).

## Shared context providers (documentation-only in Tutor)

Current Core also supports one `context.agents.context.registerShared(provider)` registration during activation. Unlike the owned-agent provider, it supplies only `{context:[{name,content}]}` support text to subsequent ordinary and mod-owned agent turns; it does not grant identity ownership, tools or authority. Core invokes it with the trusted agent/session and cancellation signal. Names must be unique non-path identifiers, at most 128 characters; at most 64 records and 1,000,000 combined UTF-8 bytes of names/content are accepted per provider. Invalid or failing live providers fail the dependent turn rather than silently truncating their contribution.

Only loaded, available providers contribute. Core checks publication again after the call, so a replaced or revoked host cannot supply stale results. Disabling a mod removes its contribution from future turns, not saved conversation history. Tutor contains no runnable shared-context provider or integration test; Menagerie is a separate consumer, not part of this lab.

## Failure and lifecycle behavior

These are asynchronous host capability calls. Their promises reject on validation/integration failure. Generic host work has no default capability deadline, though a Core integration may configure a positive metadata timeout. Host shutdown rejects outstanding work; an HTTP route still has its separate route deadline. Do not turn a rejected read into an empty list or invented operator record.

The generic host permits at most four active capability requests per installed mod. Avoid an unbounded `Promise.all` when enriching an agent list. Agent and operator metadata are live reads, not a snapshot shared across calls.

## Boundary

No ordinary declaration is needed. `system: true`, `systemCapabilities`, `context.modManagement`, and `context.processExecution` are unrelated privileged contracts and provide no additional ordinary identity authority. Installation and an MCP tool grant likewise do not make arbitrary route callers operators.

## Verify

`test/advanced-capabilities.test.mjs` checks Tutor's payload validation and forwarding. `npm run test:core` invokes the route through Tutor's forked host and current Core capability service, verifies agent identity and operator timezone, and confirms private operator profile/avatar fields do not cross the boundary. It uses controlled stores rather than the running installation; see [coverage](coverage.md).

## Current Core completion feed

Checked **7 November 2026**: `context.agents.runs.onCompleted(handler)`, `.list({cursor, limit?})`, and `.activity({agentIds?})` provide generic completion/activity metadata. The callback is an advisory cursor wake-up, so catch up on activation, persist a durable checkpoint and make downstream work idempotent. Events do not contain transcripts or credentials. Activity may report `response_pending`, meaning model work has retired but its HTTP answer has not finished; readiness is not an exclusive reservation.

See the [full Core completion contract](https://docs.goblin-kingdom.com/burrow/development/extensions/#durable-agent-run-completion-metadata) for pagination, trusted origin fields and delivery/retention caveats. Tutor does not expose runnable routes or integration coverage for this new surface. Adapting the lab requires implementation and negative tests, not just this documentation note.
