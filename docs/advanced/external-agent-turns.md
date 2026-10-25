# Externally initiated agent turns

[Advanced index](index.md) · [Runnable source](../../server/advanced/external-agent-turns.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs) · [Core contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

`context.agents.turns` is the ordinary-mod ingress for a user message that arrives through an external product such as a transport adapter. It starts the selected agent's normal chat-turn pipeline—profile, context, tools, model selection, session serialization and continuity—not an isolated `models.generateText` call.

```js
const accepted = await context.agents.turns.submit({
  agentId: 'hatchet',
  sessionId: 'telegram:account-42:chat-7',
  message: 'Summarize the latest update.',
  idempotencyKey: 'telegram-update:9981',
});
// { turn: { id, status: 'queued' | 'running' | ... }, replayed }

// In a later request/interaction:
const turn = await context.agents.turns.read(accepted.turn.id);
```

## Admission and durable identity

Core accepts only a registered, currently enabled `agentId`. Supply an explicit non-empty **durable** `sessionId`; do not use an activation-local counter or random value if subsequent external messages should share conversational continuity. The prompt must be non-empty (maximum 100,000 characters).

Core also accepts optional `displayMessage` (non-empty, up to 100,000 characters) for the human-visible transcript while `message` supplies model-facing input. Omitted `displayMessage` defaults to `message`; replay identity includes both. Tutor’s exact-field HTTP adapter does **not** accept this option. Do not pass it to the example route without adapting the code.

The non-empty `idempotencyKey` (maximum 256 characters) identifies one logical external message. Core binds the trusted installed mod ID, so the same text key used by two mods does not collide. Repeating the exact agent/session/message/key returns the same turn with `replayed: true`; changing any of those fields while retaining the key fails with `mod_external_turn_idempotency_conflict`. The exact replay is allowed even if the agent became disabled after the original acceptance.

Tutor's route takes a bounded product `requestId`, derives a stable mod-local key, and saves `{agentId, sessionId, message, idempotencyKey, turnId}` in mod settings. Intent is written **before** submission. If submission or receipt persistence fails ambiguously, repeat `POST /advanced/agent-turns` with the same `requestId` (and either the same full payload or only the retained identity fields omitted); never invent a replacement key for the same external message.

This small lab stores prompt text in ordinary settings for teaching clarity. That is not a secret/private-message vault. A production transport owns retention, privacy, per-record authorization and deletion policy.

## Explicit operator control, never automatic dispatch

The standalone Advanced entrypoint registers the example, but dispatch starts disabled and nothing calls it on activation, refresh, status reads, a timer, or an agent tool.

1. Authenticated operator calls `PUT /advanced/agent-turns/configuration` with `{ "enabled": true }`.
2. Operator calls `GET /advanced/agent-turns/status` and selects an `enabled: true` agent.
3. Operator explicitly submits:

```json
{
  "requestId": "transport-event-9981",
  "agentId": "hatchet",
  "sessionId": "transport:account-42:thread-7",
  "message": "Please handle this message.",
  "confirmDispatch": true
}
```

The route validates exact fields and requires trusted operator authentication. Product authorization remains the mod's responsibility; enabled-agent validation in Core does not authenticate the external sender.

## Accept now, poll later

`submit` returns after Core atomically persists a receipt. `202` means **accepted**, not completed. The route must return that receipt promptly—never loop, sleep, or await model completion inside the HTTP handler. Later call `GET /advanced/agent-turns/:requestId`, which loads the retained turn ID and invokes `turns.read`.

Statuses are `queued`, `running`, `succeeded`, `failed`, or `interrupted`. The public record is bounded to identity, status/run/timestamps, sanitized error, and terminal result. A result contains at most 24,000 characters of `answerText`, a bounded decision, up to 20 bounded blockers, and bounded verification. It never includes the prompt, tools/results, traces, credentials, runtime paths, provider payloads, or model configuration.

Core enforces same-mod ownership on reads. A turn ID accepted for another mod behaves as missing. That boundary does not replace the transport's own per-user/per-chat authorization before exposing a retained result.

## Interruption and retry semantics

Receipts/results survive child and ordinary host reload because Core persists them and executes work outside the mod child. In-flight work is **not** promised to resume after a Core process restart. Startup marks prior `queued`/`running` receipts `interrupted` with `core_restart_before_completion`; shutdown can similarly produce an interruption.

Retrying the same idempotency key returns that same interrupted receipt and does not duplicate the turn. If product policy deliberately asks the agent to try again, create a new logical request with a new stable idempotency key. This Tutor lab exposes submit/read routes only; it does not expose a cancellation route. Current Core also provides `agents.turns.cancel`, but that newer capability is not demonstrated by this example. Disabling this Tutor route blocks new product dispatch but does not cancel accepted work or prevent later status inspection.

## Current Core controls not implemented by this Tutor lab

Core exposes `agents.turns.cancel(turnId)` for cooperative same-mod cancellation. It returns `{ turn, cancellationRequested }`, not proof of terminal cancellation; poll `read` until terminal. Accepted cancellation eventually reports `interrupted` / `cancelled_by_mod`. It cannot undo tool effects or immediately preempt non-cooperative work. Missing/foreign IDs both fail as not found.

Core also exposes `agents.sessions.create({ agentId, idempotencyKey })`, `.model({ agentId, sessionId })` and `.setModel({ agentId, sessionId, connectionId, model })`. Create uses a stable mod-scoped key and does not erase the previous conversation or cancel its turn. Model controls accept only sessions created by that mod through this API, not arbitrary legacy session IDs. Both model fields must be set, or both `null` to clear; the selection applies to subsequent turns, not an active run or the agent’s global default. Tutor has no routes/tests teaching these controls yet.

## Verification scope

`test/advanced-capabilities.test.mjs` checks disabled-by-default control, explicit confirmation, enabled-agent discovery, durable intent/key retention, prompt acceptance, asynchronous receipt, retry replay, conflict rejection and later polling. The checked-in `npm run test:core` test exercises the same routes through the current Core child host and capability service with the real external-turn dispatcher and an in-memory receipt store/executor—no model provider or paid work. It also checks bounded results, same-mod ownership and interruption/replay behavior.


## Source review

Documentation reconciled on 25 October 2026 against Tutor `9679fc4fe9ccd532142b84b0257d290ae8d9eec3` (2026.10.25) and Core `3bf50374d3601c821e787912d52b9044eaf649ec`. This is a source review, not a new runtime test pass.
