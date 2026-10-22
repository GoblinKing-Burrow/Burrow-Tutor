# Advanced tools and protected results

[Advanced index](index.md) · [Runnable source](../../server/advanced/diagnostics-tools.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs) · [Authoritative tool contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#agent-tools)

A mod tool is registered during activation and published by Core as provider `mod.<mod-id>`. Installation does not grant tool use.

```js
context.tools.register({
  name: 'lookup',
  description: 'Look up a record.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: { id: { type: 'string' } }, required: ['id'],
  },
  async handler(args, caller) {
    // args are model-supplied; caller identity/signal are Core-supplied.
    validateDomainInput(args);
    authorize(caller, args.id);
    return { ok: true };
  },
});
```

Treat the advertised schema as discovery metadata, not your authorization or validation boundary. The authoritative tool bridge requires handlers to validate model-supplied arguments themselves; Tutor does so even when a current host also applies schema validation. Trust `caller.agentId`, `sessionId`, `conversationId`, `runId`, and `signal`; never accept replacements from `args`.

Default `grant-required` availability uses Core's per-agent MCP tool grants. `availability: 'mod-authorized'` delegates per-agent/per-record discovery and use policy to the mod and protected resolver. It does not create grants or mean public. A production mod **must** filter discovery and deny unauthorized use. Tutor's self-diagnostics tool accepts no target identity, demonstrating self-scoping, but products still need an explicit eligibility policy.

## Ordinary sensitive values

Every sensitive leaf must be declared explicitly. Tutor's runnable `reference_sensitive_secret` tool uses this one-turn form:

```js
return {
  secret: { $burrowSensitive: { type: 'secret', value: secretString } },
};
```

Core replaces it with a `protected://` reference before chat, trace, or activity sees it. Undeclared output is ordinary model-visible JSON. Malformed declarations withhold the whole output. Ordinary `$burrowSensitive` references have the existing one-turn behavior and are not later provider-revocable. Never log sensitive values.

## Managed protected references

Use managed results when a later shell action should resolve a value only after a fresh authorization/version check:

```js
const issued = new Map();

context.tools.register({
  name: 'reference_protected_secret',
  description: 'Issue a short-lived managed secret.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  async handler(args, caller) {
    authorizeIssue(caller);
    const reference = `example-${crypto.randomUUID()}`;
    const version = crypto.randomUUID();
    issued.set(reference, {
      version,
      agentId: caller.agentId,
      sessionId: caller.sessionId || 'default',
      conversationId: caller.conversationId || null,
      expiresAt: Date.now() + 60_000,
    });
    return { secret: { $burrowManaged: {
      type: 'secret', reference, version, lifetimeMs: 60_000,
    } } };
  },
  async resolveProtectedReference(reference, caller) {
    const record = issued.get(reference);
    authorizeResolution(record, caller); // identity, expiry, version, revocation
    return await context.secrets.get('example-secret');
  },
});
```

At `shell_exec.protectedBindings` consumption, Core checks expiry, exact agent/session/conversation binding, live issuer host, provider enablement, and live tool authorization/grant. Only then does it call the resolver with the issued `version`. The resolver must recheck current access, revocation, version, and record state and return a string only when still allowed. Failure denies the entire shell action before dispatch.

Choose the shortest useful positive safe `lifetimeMs`; Core does not impose a ten-minute ceiling. Do not put secrets in `reference` or `version`: they are IPC metadata, not secret storage. Core persists no resolved value; handles disappear on expiry, Core restart, issuer shutdown, provider disable, or other denial. Rotation/grant revocation may invalidate earlier.

Tutor stores issue records in a module `Map`, binds caller identity/version/expiry, consumes a matching record before reading the secret (so a subsequent secret-read failure also consumes it), reads the real secret only during resolution, and clears outstanding records in activation cleanup. This deliberately demonstrates one-use, one-host behavior—not durable recovery. A production issuer that must survive reload needs durable opaque reference metadata and revocation/version state without storing plaintext in the handle.

Example agent-side consumption (the model sees only the protected handle):

```js
// After tool result gives protected://... as `handle`:
await shell_exec({
  command: 'consumer "$REFERENCE_SECRET"',
  protectedBindings: { REFERENCE_SECRET: handle },
});
```

Never interpolate a protected value into command text. `protectedBindings` injects it only into that process environment.

## Cancellation and lifecycle

Tool cancellation aborts `caller.signal`; pass it to cancellable nested work and check it around non-cancellable steps. The normal tool deadline applies, and a timed-out host is terminated. Disable/crash/stop revokes live routing immediately but preserves catalog/grants for restart; uninstall removes catalog and grants. Running calls are canceled by cleanup/shutdown, and retained handles fail closed. Mod tools are currently available only where mod hosts are loaded, not standalone CLI agent runs.

If durable work is accepted before cancellation, cancellation does not automatically roll it back; return a receipt and provide later status. Do not claim managed protected results make an arbitrary side effect transactional.

## Boundary

Managed references are an ordinary tool feature. They do not grant `mod-management-v1`, process execution, cross-agent diagnostics, operator authentication, or filesystem access. `availability: 'mod-authorized'` is not a shortcut around product authorization.

## Verify

`test/advanced-capabilities.test.mjs` verifies the one-turn sensitive declaration, confirms no plaintext appears in the managed declaration, resolves matching caller/version once, and denies reuse. `test/server.test.mjs` checks ordinary tool validation and cancellation. `npm run test:core` invokes both advanced result tools through Tutor's forked current-Core host and exercises the managed resolver with exact caller/version binding. It does not run the returned declaration through Core's outer `protected://` registry and real `shell_exec.protectedBindings`, nor test MCP grants, expiry/revocation, or cancellation. See [coverage](coverage.md).
