# The mod author contract

[Back to Burrow Tutor](index.md)

The authoritative reference is [Third-party mod contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md). Keep it beside the runnable example when building a mod. This guide is a map to that document, not a second contract.

## Ordinary third-party APIs

Ordinary mods can register JSON routes and agent tools, use namespaced settings and encrypted secrets, mount supported UI surfaces, and call the generic Core capabilities described by the contract.

Privileged `system: true` mods and `systemCapabilities` belong to Core integration contracts. They are not ordinary third-party APIs. Unknown manifest fields do not negotiate capabilities.

## Routes and identity

Route paths live beneath `/api/mods/<id>`. Registration rejects unsafe paths and duplicate method/path pairs. Handlers receive trusted Core auth context plus untrusted request data. Credential headers are stripped; API tokens are not operator sessions.

Validate inputs and enforce domain authorization. Generic routes are JSON-only. The normal route/tool deadline is 30 seconds; durable work should be started asynchronously rather than holding a request open.

## Tools and data

Tools publish under `mod.<id>`. The default requires per-agent MCP grants. Advanced `mod-authorized` tools must enforce their own per-agent/per-record authorization.

Core validates object schemas without coercion, default insertion, or stripping extra properties. Arguments remain model-supplied data. Caller identity and cancellation signal come from Core.

Never return or log secrets. Ordinary JSON tool output is visible. Consult the canonical contract for protected-result requirements before designing secret-bearing workflows.

## Generic capabilities and UI

The contract describes agents, operator identity/timezone, paged conversations, models, image-only Forge jobs, and owner-scoped scheduler operations. Model credentials stay in Core. Use the scheduler for recurring work rather than private recurring timers. At most four generic capability calls may be active per mod.

Supported UI surfaces include Control, Settings, and Archive. UI is trusted browser ESM; declared UI directories can expose public assets. Keep secrets and server-only code elsewhere.

## Forge images

Ordinary mods can call `context.forge.images.status()`, `context.forge.images.create({ prompt, idempotencyKey })`, and `context.forge.jobs.read(jobId)`. Core uses the operator’s saved image selection, namespaces request keys by mod identity, and returns only that mod’s image jobs. Availability is not paid-work consent; the mod must supply its own authorization and cost UX.

Keep stable request keys and job receipts durably, return asynchronous receipts, and inspect completion in later requests. Core-provided authenticated previews are not public share or download links. The facade does not provide cancellation, attachments, non-image modes, provider selection, or Forge configuration changes. See the [runnable Forge lesson](forge-images.md).

## Persistence and compatibility

Settings, secrets, and `$BURROW_RUNTIME_ROOT/mods/mod-data/<id>/` survive update and uninstall. Mods own their persistent-file schemas, locking, encryption, backup, migration, and deletion.

There is currently no manifest `apiVersion` or Core compatibility range. The canonical contract and reference mod define the current public interface. Test each Core release you claim to support and record those results; a provenance commit is not a compatibility guarantee.

See [adapt and release](release.md) for the practical checklist.

