# UI contributions: Control, Settings, and Archive

[Advanced index](index.md) · [Control source](../../ui/control.js) · [Settings source](../../ui/settings.js) · [Archive source](../../ui/archive.js) · [UI tests](../../test/ui.test.mjs)

UI modules are trusted installed browser ESM, not a sandbox. Declare only files intended to be publicly served; keep server code and secrets outside UI asset directories.

```json
{
  "ui": {
    "control": "ui/control.js",
    "settings": "ui/settings.js",
    "archive": "ui/archive.js"
  }
}
```

Core validates safe installed asset paths and exposes URLs only while the mod is available. Each module receives a scoped `api(path, init?)` helper that prefixes `/api/mods/<mod-id>`. Use relative mod paths such as `/status`, never reconstruct the namespace from untrusted input. Checked **10 November 2026**: the main panel helper also forwards query strings, for example `/status?limit=25`, under the same declaring-mod prefix. Encode values with `URLSearchParams`. It rejects path traversal, backslashes, encoded dot/slash/backslash path sequences and fragments; encoded query values remain intact. This aligns main-panel query behavior with the Archive helper, not a new Tutor route or authorization bypass.

## Control

```js
export function mountControl({ modId, root, api }) {
  const controller = new AbortController();
  let mounted = true;
  // Build with createElement/textContent, install listeners, start bounded loads.
  return () => {
    mounted = false;
    controller.abort();
    removeListeners();
    root.replaceChildren();
  };
}
```

Tutor's Control panel validates `/status`, renders with `textContent`, disables refresh while loading, exposes errors through an alert, and returns cleanup. It checks both the abort signal and `mounted` before applying asynchronous results.

## Settings

A module can export section metadata and a mount function:

```js
export const settingsSections = [{ id: 'configuration', label: 'Configuration' }];
export function mountSettings({ section, primary, overflow, api }) {
  if (section !== 'configuration') return;
  // primary/overflow expose host surface replacement helpers.
  return cleanup;
}
```

`primary` and `overflow` describe semantic mount ownership, not fixed left/right columns. A section may opt into `layout: 'form-inventory'` in its `settingsSections` metadata: the host places the bounded overflow inventory left and the complete primary editor right, stacking them below 640px of available width. Unknown layout values keep legacy placement. Existing imperative modules do not acquire this layout automatically; populate the supplied surfaces without creating another column shell or swapping their save scopes.

The imperative context may also include `selectedAgentId`. A changed selected agent remounts the contribution, so keep selection-dependent state within that mount and dispose its requests. Tutor's Beginner example does not opt into the inventory layout or implement an agent-specific editor.

The full host context also includes `modId`, `runtimeScope`, agents, `accessApi`, `refreshAgents`, and execution-environment helpers. Ordinary products should use only what their documented UI requires. `accessApi` addresses Core's operator-owned privileged capability policy; it is not needed by Tutor's ordinary settings.

Tutor's installed Beginner manifest declares a Settings contribution with navigation and primary presentation. The copyable signature above shows the optional overflow surface for products that declare an inventory column. The Beginner form:

- loads public configuration through `/status`;
- keeps the secret write-only (configured boolean, blank replacement field);
- sends trusted route input to `/configuration`;
- aborts pending work and removes listeners/surfaces on cleanup.

Never bootstrap a secret into UI props or HTML. Browser password inputs do not make returned data secret.

## Current host layouts and entity selection

Current imperative hosts recognize `form`, `form-wide`, `document` and `form-inventory` section layouts. A simple complete form can use `form`; do not create a second column shell to imitate the host. The host also provides `setEntitySelector({label,items,selectedId,onSelect,addLabel?,onAdd?} | null)` for its native shared selector and `navigateSection(sectionId, beforeNavigate?)` for guarded subsection changes. Register the selected entity with the host rather than maintaining a competing navigation bar, and clear mount-owned state during disposal.

These are current UI-host contracts used by other mods, not features demonstrated by Tutor's Beginner form. Feature-detect helpers when supporting older UI builds; the existing shared draft/confirmation rules still apply. Check the matching host's `SettingsEntityItem` shape when adapting an entity picker.

## Authenticated media in Settings

Current imperative Settings hosts also provide `fetchContent(path, init?): Promise<Response>`. Use it for a Core-returned authenticated media URL, such as a saved reference photo's `contentUrl`; then read `response.blob()` for a preview. This is different from the JSON-only, mod-prefixed `api` helper. Feature-detect `fetchContent` on older hosts and show an unavailable preview rather than constructing a public URL or routing binary media through a Mod JSON endpoint.

The helper forces `GET`, preserves normal Core authentication, and accepts only `/api/` paths. It rejects backslashes, fragments, malformed percent-encoding and decoded `.`/`..` path segments. Pass the mount's abort signal, check `response.ok`, guard late results after disposal, and revoke object URLs when replacing a preview or unmounting. These host path checks do not replace the media endpoint's authorization. Tutor's current Beginner settings do not implement a media editor.

## Shared confirmation and unsaved-change guards

Current imperative hosts also provide `confirm(options)`, `navigate(proceed)`, and `setDraft(draft | null)`. Feature-detect all three before enabling an editor that relies on them; do not substitute an unguarded navigation callback on older hosts. `confirm({title, message, confirmLabel?, tone?})` resolves to a boolean. `navigate(() => selectItem())` goes through the shared unsaved-change guard. Neither should resume destructive work or navigation after the mount is disposed.

Publish one current save scope with `setDraft({dirty, busy, save, discard})`. Each call replaces the live snapshot. `save()` returns a promise of a boolean: return true only after a successful commit and publishing a clean, not-busy scope; on validation or request failure, show the error and return false. Preserve newer edits. `discard()` restores the baseline synchronously. The host unregisters the scope on disposal, but requests and late DOM writes still need mod-side cancellation checks. Reload/close uses a browser leave warning, not the asynchronous Save/Discard/Stay dialog.

Tutor's Beginner form does not yet register a shared draft or use these helpers. Its cleanup example is not a demonstration of unsaved-change protection. Adding that integration requires a code change and host-lifecycle tests; these docs do not claim it has been implemented.

## Archive

The authoritative Archive contract is Core's [Archive UI contribution](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md#ui-modules).

```js
export function mountArchive({ modId, root, api, date }) {
  const controller = new AbortController();
  const query = new URLSearchParams({ limit: '25', ...(date ? { date } : {}) });
  void api(`/advanced/scheduler/jobs?${query}`, { signal: controller.signal });
  return { unmount() { controller.abort(); root.replaceChildren(); } };
}
```

`date` is `YYYY-MM-DD` or empty for all dates. Core remounts on date changes; do not assume an `update()` callback. Cleanup may be a function or `{unmount}` and may be sync or async. Query strings are supported by the scoped helper.

Tutor displays a read-only page of its owner-scoped scheduler jobs. Its backend currently ignores `date`; the source says so. Therefore this is a mount/query/cancellation demonstration, **not** a claim that Tutor implements date filtering or complete cursor pagination. A real Archive product owns date semantics, cursor protocol, storage, retention, filtering, authorization, and empty/error states. Archive is not a Core audit store or authentication bypass.

## Cancellation, errors, and isolation

Create one `AbortController` per mount, pass its signal to every request, suppress expected abort errors after unmount, and guard late responses. Remove event listeners and owned DOM. Do not share mutable mount state across panes.

Core isolates module load failure/timeout to the pane, but code inside a loaded UI is trusted and runs with page privileges. Use safe DOM APIs rather than interpolated HTML; validate route response shapes before rendering. The scoped helper provides routing, not domain authorization—server routes must still trust only `request.auth`/Core identity and apply record access.

## Declarative Settings

[`ui/declarative-settings.example.js`](../../ui/declarative-settings.example.js) is a standalone, syntax-checked example of the optional Core UI-host-rendered module form. It exports `createSettingsContribution({api,accessApi,agents})` and `handleSettingsAction(actionId, values)`: Core's current `ModSettingsHost` owns fields, accessibility, inventory layout, confirmation, and feedback while the module loads values and handles actions. This is distinct from manifest `contributions.settings`, which declares host slots/capabilities and no executable behavior. The optional module form is not yet described by Backend's authoritative server-side capability docs, so verify it against the UI host version you support. It is not the installed `ui.settings` entry because one module should demonstrate one mounting style clearly.

The imperative Settings host also supplies `runtimeScope`, `agents`, `accessApi`, `refreshAgents`, and `saveAgentExecutionEnvironment`. Tutor demonstrates the safe ordinary pieces (`agents` in the declarative factory and scoped `api`). `accessApi` is specifically for Core's operator-owned privileged-capability policy. The execution-environment helper mutates agent configuration and should be used only by a product whose purpose genuinely owns that workflow—not as generic mod storage.

## `apiTargets` host seam

[`server/advanced/api-targets.example.mjs`](../../server/advanced/api-targets.example.mjs) is a standalone, tested v1 CRUD example for a product that contributes browser-reachable remote Burrow API targets. Pair it with a manifest `contributions.apiTargets` endpoint and Settings slots whose capability is `apiTargets`; Core owns rendering/routing while the mod owns validated target records. Tutor does not activate or declare it because Tutor itself is not a remote-target product.

## Verify

`test/ui.test.mjs` uses a small DOM fixture to verify the installed Beginner Control refresh/error/cleanup, Beginner Settings loading/write-only secret/submission/cleanup, and the standalone Advanced Archive date query/render/abort/unmount. `test/advanced-ui-contracts.test.mjs` covers the standalone declarative Settings and `apiTargets` examples. `npm run test:core` confirms current Core discovers the two installed Beginner UI URLs; Archive stays outside that manifest by design. It does not import/mount any module in Core's browser UI. Browser integration, CSP/load timeout, and host-surface behavior remain gaps in [coverage](coverage.md).
