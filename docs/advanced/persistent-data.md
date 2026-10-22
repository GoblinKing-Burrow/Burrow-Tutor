# Persistent mod-data

[Advanced index](index.md) · [Runnable source](../../server/advanced/persistent-data.mjs) · [Focused test](../../test/advanced-capabilities.test.mjs) · [Authoritative contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#generic-core-capabilities)

Use `$BURROW_RUNTIME_ROOT/mods/mod-data/<mod-id>/` for mod-owned files that must survive code replacement. This is separate from replaceable installed code at `mods/<mod-id>/`. Core skips the reserved `mod-data` directory during discovery and rejects `mod-data` as an installable/manageable mod ID.

```js
import path from 'node:path';

function dataFile(context, name) {
  const root = process.env.BURROW_RUNTIME_ROOT;
  if (!root || !path.isAbsolute(root)) throw new Error('mod_data_root_unavailable');
  return path.join(root, 'mods', 'mod-data', context.id, name);
}
```

Use the trusted `context.id`, never a body/query-supplied owner. Keep filenames fixed or validate them against a strict allowlist; do not join arbitrary user paths. Tutor stores one `advanced-note.json` file and limits note text to 32,768 UTF-8 bytes.

## Atomic single-host write example

Tutor serializes writes in this child process and replaces through a temporary file:

```js
let writes = Promise.resolve();

writes = writes.catch(() => {}).then(async () => {
  const file = dataFile(context, 'advanced-note.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(note, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
});
await writes;
```

Writing then renaming in the same directory avoids exposing a partially written JSON file. The promise chain serializes writers only inside one live host. It is **not** a database transaction, cross-process lock, multi-Core protocol, backup, or crash-proof transaction across multiple files. A crash can leave a temporary file, and filesystem durability still depends on the platform (the example does not `fsync`). Production code needs explicit startup cleanup/recovery and stronger locking/transaction semantics where required.

Tutor's operator-only routes are:

```js
await api('/advanced/data/note');
await api('/advanced/data/note', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'durable lesson' }),
});
```

Malformed JSON content on disk is treated as `mod_data_read_failed`, not silently replaced. A valid but wrong-shape document returns `note: null` in this small example; a real schema should version records and distinguish missing, old, and corrupt data.

## Ownership and retention

Core preserves mod-data across normal update and uninstall. That is retention, not lifecycle management: the mod owns schema versions, migrations, locking, encryption/key handling, backup/restore, retention, quotas, and explicit deletion. Uninstall does not promise erasure. Document a purge procedure if users expect deletion.

Do not put persistent data inside the installed code directory; updates can replace it. Do not put secrets in plaintext merely because a file mode is `0600`. Prefer `context.secrets` for small encrypted string secrets, and design encryption plus key rotation for larger sensitive datasets. Avoid logging paths/content that disclose private records.

Same-mod filesystem placement does not provide per-user authorization. Tutor requires trusted operator route access; a multi-user mod must associate records with trusted identities and check each read/write.

## Settings, secrets, or files?

- `context.settings`: small mod-ID-scoped JSON configuration and receipts; survives update/uninstall.
- `context.secrets`: small mod-ID-scoped encrypted strings; return only configured state.
- `mod-data`: mod-designed files for larger/custom data; all storage engineering remains yours.

All can fail. Await writes before acknowledging success. A failed response near a write is an ambiguous outcome, so make retried operations safe and read back authoritative state. Host cleanup should drain or safely abandon work; Tutor awaits each route write but keeps no long-running queue at shutdown.

## Boundary

The reserved directory is not raw Core database access, an arbitrary controller filesystem capability, or a sandbox guarantee. Mods are trusted executable code, but portability and coexistence require staying beneath the installed mod's own `mod-data/<context.id>` directory. `context.processExecution` is privileged and unrelated.

## Verify

`test/advanced-capabilities.test.mjs` creates a temporary runtime root, writes through Tutor's route, reads back, and verifies the fixed path. It does not test crash recovery, multi-process locking, backups, migrations, encryption, disk-full behavior, or Core uninstall retention. `npm run test:core` currently activates the route but does not exercise the filesystem path. These are explicit gaps in [coverage](coverage.md).
