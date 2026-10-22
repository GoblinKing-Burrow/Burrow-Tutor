# Lesson: ordinary-mod Forge images

An ordinary mod can request an image through Core's **generic, image-only** Forge facade. No `system: true`, `systemCapabilities`, provider keys, or provider SDK is needed. This lesson and the runnable [`server/forge-images.mjs`](../server/forge-images.mjs) scaffold extend Tutor's small reference mod; Tutor does not currently have a separate lesson engine or code generator. Copy the module and its activation call when starting a product, rather than inventing a second provider integration.

The public author contract is [`docs/mod-contract.md`](mod-contract.md), **Generic Forge images**. Test against the Core release you support.

## 1. Check the operator's saved selection

```js
const status = await context.forge.images.status(); // { available, reason? }
```

`available` says whether the operator's **saved Forge image selection** currently resolves to an available image model. It is not product consent, a price quote, or a promise that creation will succeed. Missing/unavailable selections must be handled without attempting paid work. Ask the operator to configure Forge through Core's normal UI; the mod cannot choose a provider, connection or model, discover their IDs through this facade, or change Forge configuration. Availability can change after the check; handle creation failures too.

## 2. Get product consent before paid creation

Creation is asynchronous and **may incur cost**. The mod owns its product-level enablement and authorization UX. The reference scaffold:

- starts disabled, with a separate operator-authorized opt-in;
- requires explicit `confirmPaid: true` for each image request;
- trusts Core's route `auth`, never a body-supplied user/agent ID;
- intentionally registers no agent image tool. If you add one, ordinary MCP grants are not a substitute for product-level paid-work policy.

As with other reference routes, intentionally auth-disabled Core installations use the permitted trusted-network control plane. Auth-disabled does not secretly add login. A production UI must explain the cost before sending consent, not silently set the confirmation flag.

## 3. Store a stable logical request and return a receipt

```js
// requestId is generated ONCE for this logical image request and retained by
// the product/client across retries. A genuinely new request gets a new ID.
const { job, replayed } = await context.forge.images.create({
  prompt: 'A goblin teaching mod development',
  idempotencyKey: `image:${requestId}`,
});
await context.settings.set(`image-job:${requestId}`, job.id);
// Return the receipt now. It is not a finished image.
```

`create` accepts only a non-empty prompt and **mod-local idempotency key**. Do not pass a mode, provider, model, connection, owner, or configuration. Core namespaces the key by the trusted installed mod ID before paid dispatch. Do not manually add another mod's ID, generate a fresh key on retry, or use the prompt alone as the key: two intentionally separate images may share a prompt.

The runnable scaffold is stronger than this minimal API illustration: it saves a prompt digest and empty job receipt **before** dispatch, serializes identical request IDs within one host, rejects reuse for a different prompt, then persists the returned job ID before replying. If a reply or receipt write is lost, resubmit the same request with the same prompt and request ID: Core can replay the receipt without another paid dispatch while the saved selection remains compatible. Changing the saved image selection between dispatch and recovery can return an idempotency conflict. Keep the original request key, investigate the existing job, and never automatically mint a new paid key to bypass that conflict. A local prompt mismatch is a conflict, never a reason to silently mint a new paid key.

Persist job IDs durably, not in a module variable. They are needed after reload and for later reads. In this small example settings hold one record per request; no raw prompt is persisted there. A larger product must own transactional storage, retention, locking, backup and migration. Do not prune an outstanding intent just because a request timed out; losing its stable key can turn a retry into a second paid request. A route/transport error is not proof that dispatch never happened.

## 4. Read later, don't wait inside the submitting route

```js
const job = await context.forge.jobs.read(savedJobId);
```

Return the creation receipt immediately (the scaffold uses HTTP 202). Poll/read in **later requests**, including after a mod reload, until success or failure. Do not loop awaiting terminal completion inside the HTTP route: routes have a deadline and image work can outlive them. The facade is separate from `context.scheduler` and does not create an agent turn.

Core returns only image jobs created by this **same installed mod**; missing, foreign-mod, operator/native, and non-image jobs are not a cross-mod lookup API. Same-mod ownership is not per-user authorization: a multi-user product must additionally enforce its own per-record access rules. Returned jobs contain bounded status, timestamps, a sanitized error code, and public artifact metadata. They do not contain the prompt, provider credentials, model/connection IDs, or storage references. Treat a queued/running receipt as pending, not successful generation. Surface failures honestly and retain the ID for inspection.

## 5. Preview safely

On success use an artifact's Core-provided, authenticated `previewUrl` for an image preview. It is not a public share link or download URL. Use safe DOM APIs, not HTML interpolation; do not expose secrets or proxy raw storage references. For example in a trusted mod UI:

```js
function showPreview(root, job) {
  const artifact = job.status === 'succeeded' && job.artifacts.find(a => a.kind === 'image');
  if (!artifact?.previewUrl) return;
  const url = new URL(artifact.previewUrl, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/forge/jobs/')) {
    throw new Error('Unexpected preview URL');
  }
  const image = document.createElement('img');
  image.alt = 'Generated image';
  image.src = url.href; // normal authenticated Core preview, not arbitrary markup
  root.replaceChildren(image);
}
```

This generic facade offers **no cancellation, attachment delivery, downloads, non-image modes, provider selection, or Forge configuration mutation**. Disabling the product, aborting a browser request, or unmounting a UI does not cancel a submitted job: it runs to success or failure. Do not promise a cancel/download button or pass an `AbortSignal` as if creation supported cancellation.

## Try the bundled scaffold

Use the installed mod's scoped UI `api` helper (paths below are relative to `/api/mods/burrow-reference-mod`). No UI action in the reference mod automatically creates paid work; its existing greeting/secret UI stays unchanged. These calls illustrate the explicit product flow to build into your UI:

```js
await api('/images/status'); // { ok, enabled: false, available, reason? }
// Only after showing an operator opt-in explaining paid image work:
await api('/images/configuration', {
  method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: true }), // mod setting, NOT Core Forge config
});
// Generate/persist requestId once per logical request, not once per retry.
const requestId = crypto.randomUUID();
const input = { requestId, prompt: 'A goblin tutor', confirmPaid: true };
// Only after the operator explicitly confirms this paid request:
const receipt = await api('/images', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(input),
});
// Retain receipt.job.id. Later, e.g. on a Refresh button or bounded UI polling:
const { job } = await api(`/images/jobs/${encodeURIComponent(receipt.job.id)}`);
```

The runnable scaffold limits prompt length to 10,000 characters and request IDs to 80 safe characters as **example product policy**, not universal Core ceilings. It returns no-store JSON; unexpected capability/persistence errors become `image_request_failed` rather than leaking raw provider details. Disabling via `{ enabled: false }` blocks new submissions, but still allows inspecting existing jobs.

## Verify without spending money

`npm test` covers input/auth/consent, intent/receipt persistence failure, stable retry across reload, and existing UI behavior. `npm run test:core` discovers the packaged mod and exercises its forked host against current Core's actual generic-capability service: availability, owner scoping, asynchronous receipts, replay, bounded public artifacts and later job reads. The paid Forge store is an in-memory stand-in: these checks do **not** call a provider or claim live PostgreSQL/provider verification.

