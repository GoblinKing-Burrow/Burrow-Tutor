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

Use `context.id`, not a request parameter, as the installed mod identity. The agent list includes only the bounded identity, display name, and enabled state. It is useful for a picker; it does not grant authority to act as an agent, expose its workspace, or start a disabled runtime. Validate a selected ID again at the capability that consumes it.

`displayIdentity()` exposes the stable display ID and configured display name only. It does **not** expose avatar data, profile documents, preferences, authentication identity, secrets, or authorization. It is presentation metadata, not proof that an HTTP caller is the operator. For routes, use Core's trusted `request.auth` and your product's authorization policy; never accept identity from body, query, forwarded headers, or tool arguments.

`timezone()` returns Core's operator timezone. Scheduler evaluation already uses that timezone; legacy scheduler `timezone` payload fields are ignored. Displaying it can explain a cron schedule, but a mod cannot change it through this interface.

## Failure and lifecycle behavior

These are asynchronous host capability calls. Their promises reject on validation/integration failure. Generic host work has no default capability deadline, though a Core integration may configure a positive metadata timeout. Host shutdown rejects outstanding work; an HTTP route still has its separate route deadline. Do not turn a rejected read into an empty list or invented operator record.

The generic host permits at most four active capability requests per installed mod. Avoid an unbounded `Promise.all` when enriching an agent list. Agent and operator metadata are live reads, not a snapshot shared across calls.

## Boundary

No ordinary declaration is needed. `system: true`, `systemCapabilities`, `context.modManagement`, and `context.processExecution` are unrelated privileged contracts and provide no additional ordinary identity authority. Installation and an MCP tool grant likewise do not make arbitrary route callers operators.

## Verify

`test/advanced-capabilities.test.mjs` checks Tutor's payload validation and forwarding. `npm run test:core` invokes the route through Tutor's forked host and current Core capability service, verifies agent identity and operator timezone, and confirms private operator profile/avatar fields do not cross the boundary. It uses controlled stores rather than the running installation; see [coverage](coverage.md).
