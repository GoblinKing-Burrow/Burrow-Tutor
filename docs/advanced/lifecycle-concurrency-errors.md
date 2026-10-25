# Lifecycle, concurrency, cancellation, and errors

[Advanced index](index.md) · [Canonical Tutor contract](../mod-contract.md) · [Public host contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

These rules cut across every advanced capability.

## Activation and cleanup

Register routes, tools, and the optional diagnostic adapter during `activate(context)`. Tool registration closes after activation. Return either cleanup or `{ close() }`:

```js
export async function activate(context) {
  registerEverything(context);
  return async () => {
    abortBackgroundWork();
    clearSensitiveInMemoryState();
    await drainSafeWrites();
  };
}
```

Tutor clears managed protected-reference records and logs stop. UI modules independently return cleanup/`{unmount}` and abort per-mount work.

Fresh installs start disabled. Enabling starts the host and publishes routes/tools/UI. Disable, crash, or stop revokes live routing; tool catalog/grants survive disable for re-enable, while uninstall removes catalog/grants. Updates preserve enabled state. Settings, secrets, and mod-data survive update and uninstall, so provide explicit data deletion where needed.

`system: true` is a privileged trust classification, not special lifecycle. Ordinary mods must not declare `systemCapabilities`.

### Optional managed skills (documentation-only in Tutor)

An enabled ordinary mod may declare read-only, globally available `managedSkills` entries with an ID, Git repository, and repository-relative path to `SKILL.md` or a skill package. Core owns fetch, validation, reconciliation, runtime storage, periodic refresh, failure retention, conflicts, and removal from the effective catalog on mod disable/uninstall. This is a manifest contribution, not an agent tool or arbitrary code execution; fetching a package does not run scripts or Git hooks.

Tutor intentionally declares no managed skill and contains no runnable skill package or test, so use Core's [managed-skills guide](https://burrow-docs.blissful-psychosis.com/burrow-skills/managed-skills/) rather than inferring behavior from this repository. The future `SKILL.md` mentioned by the advanced index is not present and must not be treated as current Tutor implementation.

## Concurrency budgets

The generic host permits four active capability calls per installed mod. Do not create an unbounded `Promise.all` over agents/conversations/generations. Use a small queue, page incrementally, persist checkpoints after consumption, and release traversals by reaching the final page.

The normal HTTP route/tool deadline is separate from capability timeouts. Core capability work has no default wall-clock deadline, though integrations may configure positive metadata/read and model-generation timeouts. A timed-out invocation returns `mod_route_timeout`, cancels invocation-scoped capability work, and leaves the child and unrelated routes available. Already accepted durable jobs continue independently. Durable long work should return a receipt and expose later status.

Tutor-specific concurrency examples:

- Forge serializes equal request IDs in one host and persists stable intent for reload recovery.
- Persistent notes serialize writes in one host and rename atomically, but are not cross-process transactional.
- Conversation inventory allows at most 16 unfinished snapshots per host and expires them after five minutes.

## Cancellation matrix

| Work | Cancellation contract |
| --- | --- |
| Mod tool | `caller.signal`; cleanup/shutdown aborts running calls. |
| `conversations.read` | optional `{ signal }`; rejects `mod_capability_cancelled`; synchronous reader work stops cooperatively. |
| `models.generateText` | optional `{ signal }`; aborts provider request and rejects `mod_capability_cancelled`. |
| `runtimeDiagnostics.read` | optional `{ signal }`; use the active tool's signal. |
| UI `api` request | browser `AbortSignal`; abort on unmount and ignore late results. |
| External agent turn | Core `agents.turns.cancel(turnId)` requests cooperative owner-scoped cancellation; poll for terminal state. Tutor exposes no cancellation route. |
| Durable text generation | No cancellation API; losing a route does not cancel accepted work. |
| Forge image job | **No cancellation after submission**; aborting the route/UI is not job cancellation. |
| Scheduler accepted work | no ordinary per-call signal/cancel API; disabling intent affects scheduling, not rollback of already dispatched work. |

Cancellation is not transaction rollback. If durable acceptance may precede cancellation, retain the receipt and reconcile later. Host shutdown rejects outstanding generic capability work (`mod_capability_shutdown` in the generic contract) and ignores late results.

Tutor's conversation/model HTTP adapters currently do not forward an inbound route signal to Core because the route request contract does not expose one in this scaffold. Direct tool/background calls can use the documented capability signals.

## Error handling and ambiguous outcomes

Capability promises reject. Preserve stable, documented codes for control flow and avoid exposing raw provider/database errors, prompts, credentials, or filesystem details. Tutor returns bounded product codes such as `advanced_input_invalid`, `paid_confirmation_required`, `operator_authentication_required`, and generic `advanced_request_failed` / `image_request_failed` / mod-data errors.

Never reinterpret failure as:

- an empty agent/job/conversation inventory;
- complete history;
- successful text/image generation;
- proof that paid dispatch or scheduler mutation never happened;
- authorization approval.

Classify operations before retrying:

- **Read:** usually retryable; stale conversation cursor requires restart/deduplication.
- **Idempotent update with known desired state:** read back, then retry safely.
- **Non-idempotent/ambiguous mutation:** reconcile authoritative state first.
- **Forge create:** retry only with the original logical idempotency key and matching prompt.
- **Protected resolution:** fail closed; obtain a newly authorized handle if appropriate.

Do not leak exception text to agents/UI unless it is an intentional bounded product error. Keep logs free of secret-bearing arguments/results.

## Identity and authorization

There are distinct trust channels:

- HTTP route: Core-supplied `request.auth`; API bearer tokens are not operator sessions. In intentional `authMode=none`, both booleans are false and the mod must document its trusted-network fallback.
- Tool: immutable Core caller context; arguments cannot set identity.
- Capability ownership: trusted installed `context.id`, used by scheduler/Forge/Core stores.
- Privileged operator policy: Core-owned grants/access lists; never mod settings.

Installation grants none of: MCP tool use, paid-work consent, cross-agent diagnostics, privileged mod management, or process execution.

## Privileged boundary

Ordinary mods receive `context.id`, `api`, `tools`, `diagnostics`, `runtimeDiagnostics`, `settings`, `secrets`, `agents`, `operator`, `conversations`, `models`, `forge`, `scheduler`, and `logger`. They do not receive `context.modManagement` or `context.processExecution`.

`mod-management-v1` and `execution-provider-v1` require a trusted system declaration **and** operator-owned grants. Do not add them to an ordinary manifest, emulate them with HTTP, or infer them from `availability: 'mod-authorized'`.

## Verification discipline

- `npm run build`: syntax-check all bundled server/UI modules.
- `npm test`: fixture/unit behavior, including negative paths and UI cleanup.
- `npm run test:core`: current sibling Core package discovery/host contract, in-memory Forge integration, and substantive advanced identity/conversation/model/scheduler/diagnostic/protected-result RPC through the forked host with controlled stores/providers.

A green activation test is not proof that every capability ran against real Core stores/providers. [Coverage](coverage.md) marks exact current-Core verification and gaps.
