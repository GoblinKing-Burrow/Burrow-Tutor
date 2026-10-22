# Forge images

[Advanced index](index.md) · [Full Forge lesson](../forge-images.md) · [Runnable source](../../server/forge-images.mjs) · [Unit tests](../../test/forge-images.test.mjs) · [Authoritative contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

Forge's generic image facade is an **ordinary**, image-only capability. The full lesson already documents the complete runnable flow; this page is the advanced-track map and boundary checklist rather than a second divergent contract.

```js
const status = await context.forge.images.status();
const receipt = await context.forge.images.create({
  prompt,
  idempotencyKey: `image:${requestId}`,
});
const job = await context.forge.jobs.read(receipt.job.id);
```

## Safe flow

1. Read status. `available` means the operator's saved image selection currently resolves; it is not consent, a quote, or a success guarantee.
2. Apply your own product enablement/authorization and explain that creation may incur cost. Tutor starts disabled and requires `confirmPaid: true` per request.
3. Generate one stable mod-local idempotency key per logical request. Tutor validates a safe `requestId`, stores a prompt digest and empty receipt **before** paid dispatch, then stores the job ID before replying.
4. Return the queued receipt promptly. Read the persisted job in later requests, including after reload. Do not wait to terminal state in the submitting route.
5. On success, display Core's authenticated same-origin `previewUrl` with safe DOM APIs.

Core namespaces the key by trusted installed mod ID. It exposes no provider credentials, saved connection/model ID, prompt, storage reference, download URL, or another mod's job. Reads are same-mod image ownership, not per-user authorization.

## Retries, failures, and cancellation

A transport error or lost response does not prove dispatch failed. Retry the **same** prompt and request ID. Tutor serializes equal request IDs in one host, rejects reuse with a different prompt, and relies on Core replay after reload. Its settings storage is illustrative; a multi-writer product needs transactional durable intent storage.

Queued/running is pending. A sanitized failed job is terminal failure. Keep the ID for inspection. Disabling product submissions, aborting a browser request, unloading UI, disabling the mod, or uninstalling it does **not** cancel an accepted Forge job. Submitted jobs run to success or failure.

The generic facade has no cancellation, attachment delivery, download operation, non-image mode, provider/model selection, or Forge configuration mutation. Never promise those controls or pass an `AbortSignal` as though job cancellation existed.

## Boundary

No `system: true`, `systemCapabilities`, provider SDK, or MCP grant is needed. Conversely, a tool grant is not paid-work consent. Tutor intentionally registers no image tool. If a product adds one, it must enforce trusted caller policy and paid-work authorization in addition to Core grants.

## Verify without provider spend

`test/forge-images.test.mjs` checks auth, exact input/consent, persistence-before-dispatch, stable retry after a simulated host reload, and opaque failures. The Forge case in `test/core-contract.test.mjs` uses current Core's real generic capability service with an in-memory Forge store to verify saved-selection status, owner scoping, async receipt, replay, bounded public artifacts, later reads, and no cancellation on product disable. It does **not** call a live provider or PostgreSQL. Run `npm run test:core` with the sibling Backend checkout.

Read [the full Forge lesson](../forge-images.md) for copyable HTTP/UI calls, safe preview code, and all receipt-storage details.
