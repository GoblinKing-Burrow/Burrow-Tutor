# Models and isolated text generation

[Advanced index](index.md) · [Runnable routes](../../server/advanced/core-capabilities.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs) · [Authoritative contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

Ordinary mods can list operator-selected enabled models and request isolated text generation. Provider credentials stay in Core.

```js
const models = await context.models.list();
const selected = models[0];
const controller = new AbortController();
const { text } = await context.models.generateText({
  connectionId: selected.connectionId,
  model: selected.model,
  prompt: 'Summarize this record.',
  maxTokens: 500,
  effort: selected.defaultReasoningEffort,
  ...(selected.supportsTemperature ? { temperature: 0.2 } : {}),
}, { signal: controller.signal });
```

A listed record contains `connectionId`, `model`, `provider`, optional display `label`, optional positive `contextWindow`, canonical `reasoningEfforts`, `defaultReasoningEffort`, `supportsTemperature`, and optional `defaultTemperature`. It contains no provider key or authentication metadata. IDs are selectors, not secrets and not authorization.

`prompt` must be non-empty. `maxTokens` is an optional positive safe integer. `effort` must be `off` or a listed canonical effort; `reasoningEffort` is accepted by Core as an alias. Temperature must be numeric from 0 through 2 and supported by that model. When omitted, adapter/model defaults apply.

Generation uses the existing Core model adapter with `tools: null`. It does **not** create or mutate a chat session, run agent tools, append a turn, or act as an agent. Core adds no special mod prompt/output ceiling, but provider/model capacity, shared adapter transport bounds, and host RPC transport still apply.

## Product policy and the Tutor route

Model calls may incur cost. Core's capability validates the model request, but your mod owns product authorization, rate/usage policy, and user-facing consent. Tutor's `POST /advanced/models/generate` therefore requires trusted operator route access and an explicit product field `confirmPaid: true`; it strips that field before calling Core.

```js
await api('/advanced/models/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    connectionId, model, prompt,
    maxTokens: 500, effort: 'low', temperature: 0.2,
    confirmPaid: true,
  }),
});
```

Tutor's 100,000-character prompt check is example policy, not a universal Core maximum. Always select from a fresh `models.list()` result; a model can be disabled or reconfigured between listing and generation.

## Durable generation jobs for slow models

When provider work may exceed an HTTP route deadline—especially local LLMs—submit a durable Core job and poll it later instead of awaiting `generateText()` inside the route:

```js
const accepted = await context.models.generations.submit({
  connectionId: selected.connectionId,
  model: selected.model,
  prompt: 'Summarize this record.',
  maxTokens: 500,
  idempotencyKey: 'record-summary:42',
});

const job = await context.models.generations.read(accepted.job.id);
```

The mod-local idempotency key is mandatory. Exact retries return the same job; changed input with the same key fails. Status is `queued`, `running`, `succeeded`, `failed`, or `interrupted`. Core keeps credentials and prompts private, returns bounded terminal text, limits durable provider dispatch globally, interrupts uncertain unfinished work on restart, and stops admission, aborts active provider calls and drains their persistence during normal shutdown. Shutdown is not a promise that every accepted job completes successfully. There is no cancellation operation. A route timeout now cancels only that invocation and leaves the mod loaded, but durable jobs remain the correct design for slow work.

Tutor exposes `POST /advanced/models/generations` and `GET /advanced/models/generations/:jobId` as operator-only examples. The submit route requires `confirmPaid: true` and a stable product `requestId`; it returns `202` acceptance rather than waiting for text.

## Cancellation, concurrency, and failures

Pass an `AbortSignal` to cancel an in-flight provider request. Core rejects it with `mod_capability_cancelled`. Host shutdown aborts outstanding provider requests and rejects with `mod_capability_shutdown`. A configured integration timeout rejects with `mod_capability_timeout`. There is no default capability wall-clock deadline, but an HTTP route still has its own deadline; do not use a route to wait for work intended to outlive it.

At most four generic capability calls are active per mod. Bound application queues instead of launching arbitrary parallel generations. Promise rejection is not generated text and should not be cached as success. Whether a provider may have observed a request before cancellation is provider behavior; this API offers cancellation, not transactional rollback or idempotency.

The bundled route does not pass a route abort signal into `generateText`; direct tool/background code can use the copyable call above. It returns a generic `advanced_request_failed` on unexpected errors so provider details are not exposed.

## Boundary

No `systemCapabilities` or provider SDK is required. The mod cannot obtain credentials, install models, change Core's selected models, enable tools for a generation, or impersonate a chat turn through this facade. Agent MCP tool grants are unrelated to model-generation authorization.

## Verify

`test/advanced-capabilities.test.mjs` checks exact input validation, paid confirmation, option forwarding, and response handling. `npm run test:core` sends the request through Tutor's forked host, current Core model selection, and the real model adapter to a controlled local provider response; it verifies safe metadata, effort/temperature forwarding, omitted tools, and credential privacy. The request supplies `maxTokens`, but this integration case does not assert the provider token field. Live paid providers, cancellation, timeout, and concurrency remain gaps documented in [coverage](coverage.md).

The durable-generation route tests use a fake generation dispatcher for acceptance/replay/read checks. They do not prove a production worker survives restart or a real slow provider completes. No application tests were run during the 25 October 2026 full source review.
