# Conversation inventory and complete reads

[Advanced index](index.md) · [Runnable routes](../../server/advanced/core-capabilities.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs) · [Authoritative contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

Use conversation capabilities for a read-only inventory and retained history. They do not mutate chat, start an agent, or return prompt context.

## Inventory

```js
let cursor;
do {
  const page = await context.conversations.list({
    agentId: 'hatchet', limit: 100, includeArchived: true,
    ...(cursor ? { cursor } : {}),
  });
  for (const conversation of page.conversations) consume(conversation);
  cursor = page.hasMore ? page.nextCursor : null;
} while (cursor);
```

The default page size is 50 and the maximum is 100. Entries contain `id`, `agentId`, `archiveTitle`, `updatedAt`, `archived`, and `archiveId`; reset snapshots also contain `sourceSessionId`. Agent IDs must be registered. Core can read a disabled agent's persisted workspace without starting it when a workspace resolver is available.

The first page captures an immutable inventory sorted by conversation identity. Continue with the opaque `nextCursor`; do not inspect or manufacture it. The snapshot is scoped to this host, agent, resolved workspace, and `includeArchived`, expires after five minutes, and is released on the final page or host shutdown. Core retains at most 16 unfinished snapshots per host.

- `mod_conversation_cursor_stale`: expired, completed, cross-scope, legacy, reload-invalidated cursor. Restart at page one.
- `mod_conversation_snapshot_capacity`: too many unfinished traversals. Finish or abandon existing work and retry later; Core does not evict somebody else's traversal.

A fresh traversal is required to see additions/deletions. The initial active/archive filesystem inventory reads are sequential, not one filesystem transaction.

Tutor exposes `GET /advanced/conversations?agentId=hatchet&limit=50&includeArchived=true&cursor=...`. It validates query values, requires trusted operator route access, and forwards the cursor unchanged.

## Complete paged reads

For an active or archived session, use its `id` as `sessionId` and omit `archiveId`. For a reset snapshot, use `sourceSessionId` as `sessionId` and include its `archiveId`.

```js
const controller = new AbortController();
let before;
do {
  const page = await context.conversations.read({
    agentId: 'hatchet', sessionId: 'default', limit: 100,
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-12-31T23:59:59.999Z',
    ...(before ? { before } : {}),
  }, { signal: controller.signal });
  acceptPage(page);
  before = page.hasMore ? page.nextCursor : null;
} while (before);
```

Pages are newest-first windows of at most 100 turns **and** 256,000 serialized UTF-8 bytes. Repeat `from` and `to` unchanged on every continuation. Cursors bind agent, session, archive, workspace, filters, and transcript manifest; reset/rotation can invalidate them.

A large turn may arrive as multiple `turn.segment` pieces. Pieces preserve the turn ID and metadata; concatenate `content` in cursor order until `end === total`. `start`, `end`, and `total` count Unicode code points. Verify the supplied SHA-256 `digest` of the normalized full turn if integrity matters. Never render pieces as separate chat turns.

If metadata alone cannot fit, the page reports a gap with reason `turn_metadata_exceeds_envelope`, `historyStatus: 'unavailable'`, and warnings, then advances past it. Follow `nextCursor` to continue older history. Retention, missing retained files, stored truncation, or an unprovable archive chain can also make history unavailable. Treat `historyStatus`, `historyWarnings`, and `gaps` as data; never label surviving turns “complete” merely because the request succeeded.

Tutor's `POST /advanced/conversations/read` forwards the read fields but currently does not forward an HTTP abort signal to Core. For cancellable background/tool code, call the capability directly as above. Aborting rejects promptly with `mod_capability_cancelled`; synchronous reader work can only stop cooperatively, and late results are ignored.

## Recovery and authorization

Persist your own checkpoint only after consuming a page. A cursor is a short-lived continuation, not durable storage or authorization. On a stale cursor, restart and deduplicate by stable turn/segment identity. A failed read is neither an empty history nor proof of complete history.

Core scopes filesystem access, but your route still owns product authorization. Tutor's route requires an authenticated operator when auth is enabled; multi-user products must enforce their own record rules. No ordinary capability reads another mod's private data, Core SQL, or arbitrary workspace files.

## Verify

`test/advanced-capabilities.test.mjs` covers validated list/read forwarding. `npm run test:core` invokes current Core's real inventory and conversation pager through Tutor's forked host using controlled conversation records. Snapshot expiry/capacity, archive/reset reads, segmentation, gaps, cancellation, and recovery remain focused gaps; see [coverage](coverage.md).
