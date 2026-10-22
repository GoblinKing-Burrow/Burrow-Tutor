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

Core validates safe installed asset paths and exposes URLs only while the mod is available. Each module receives a scoped `api(path, init?)` helper that prefixes `/api/mods/<mod-id>`. Use relative mod paths such as `/status`, never reconstruct the namespace from untrusted input.

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

The full host context also includes `modId`, `runtimeScope`, agents, `accessApi`, `refreshAgents`, and execution-environment helpers. Ordinary products should use only what their documented UI requires. `accessApi` addresses Core's operator-owned privileged capability policy; it is not needed by Tutor's ordinary settings.

Tutor's installed Beginner manifest declares a Settings contribution with navigation and primary presentation. The copyable signature above shows the optional overflow surface for products that declare an inventory column. The Beginner form:

- loads public configuration through `/status`;
- keeps the secret write-only (configured boolean, blank replacement field);
- sends trusted route input to `/configuration`;
- aborts pending work and removes listeners/surfaces on cleanup.

Never bootstrap a secret into UI props or HTML. Browser password inputs do not make returned data secret.

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
