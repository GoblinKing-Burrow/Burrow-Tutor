# Install and try the reference mod

[Back to Burrow Tutor](index.md)

Use a development Burrow installation and only install code you trust.

## Release readiness

The guides include the current image scaffold; the coordinated public snapshot follows the daily sync. If your installed version lacks the image routes, update Tutor and Core together after that sync.

Burrow installs accepted tagged snapshots, not an arbitrary branch tip. Check the repository’s available tags before following the installation steps. An empty GitHub Releases listing by itself does not prove there are no tags. On 25 October 2026, public tag [`v2026.10.23`](https://github.com/GoblinKing-Burrow/Burrow-Tutor/tree/v2026.10.23) was verified at `87dbfd7b6aa9a42e07ae343a31a766b0c98269fb`, with manifest version `2026.10.23` and the Beginner entrypoints. This verifies tag/manifest agreement, not a completed install or compatibility test. The development source reviewed for these guides is newer; refresh and check the exact tag you install.

## Add, install, and enable

1. Open **Settings → Mods → Mod sources**.
2. Add `https://github.com/GoblinKing-Burrow/Burrow-Tutor.git`.
3. Refresh the source and select an available accepted tagged version.
4. Install **Tutor**.
5. Explicitly enable it. Fresh installations start disabled.

If no accepted version appears, confirm that an accepted tag exists and its version matches the manifest. Refreshing cannot turn an untagged branch tip into a release.

## Try the UI

Open the reference mod’s Control surface to load its greeting and secret-configured status. **Refresh status** reloads those values.

Open its **Tutor** Settings contribution:
- Set a non-empty greeting, up to 160 characters after trimming.
- Optionally enter an example secret, up to 4096 characters.
- Save the configuration and refresh Control.

The secret is write-only in this UI. After saving, only a configured/not-configured indicator is returned. Leaving the field blank keeps an existing secret; the clear option removes it. Use a disposable test value for this demonstration.

## Try the agent tool

Grant `reference_greet` to the intended agent through ordinary per-agent MCP grants. The tool belongs to the `mod.burrow-reference-mod` namespace. Installing or enabling the mod does not grant it.

Ask the agent to use the tool with a name such as Ada. With the default setting, its response contains:

```json
{"ok":true,"message":"Hello from the Burrow Reference Mod. Ada"}
```

If the tool is unavailable, check that the mod is enabled and the intended agent has the grant. Tool arguments are validated; the name must be non-empty after trimming and at most 80 characters.

## Disable, update, and uninstall

- Disabling removes live routes and tools.
- Updating preserves enabled state.
- Active work can make a lifecycle operation return busy.
- Uninstalling removes code, catalog information, and grants, but preserves settings, secrets, and the mod’s persistent data directory.

Uninstall is not a data-erasure operation. Plan data deletion explicitly when adapting the example.

A configuration request returns 401 when Core says authentication is enabled but the request is not authenticated as an operator. Use the normal operator session. When authentication is disabled, this example allows configuration writes.


