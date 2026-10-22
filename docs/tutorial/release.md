# Adapt and release your own mod

[Back to Burrow Tutor](index.md)

Start with a small change you can verify: rename the example, adjust its greeting behavior, then extend it one feature at a time.

## Choose your identity

1. Read the repository [license](../../LICENSE) before copying or distributing its code.
2. Choose a unique lowercase-kebab manifest ID and matching installation directory.
3. Update display names, contribution labels, and tool names for your mod.
4. Keep a single root `burrow.mod.json` and safe relative server/UI paths.
5. Keep server-only files and secrets outside publicly served UI directories.

Changing the ID changes the storage identity. Plan migrations deliberately rather than expecting another ID’s settings or data to follow automatically.

## Extend the smallest working example

Retain input validation, trusted Core identity checks, supported cancellation handling, and UI cleanup. Register routes and tools during activation. Keep secrets write-only to the UI and expose configured-state indicators instead of values.

For paid images, keep the [Forge scaffold](forge-images.md) disabled until explicitly enabled, explain cost before confirmation, persist stable intent/receipt records, and poll later. Never treat request abort or mod disable as Forge cancellation.

Use the canonical contract for APIs beyond the example. Do not add private Core imports or privileged capabilities to an ordinary mod.

## Verify before tagging

- Run syntax checks and isolated tests.
- Run the integration test against each Core release you intend to support.
- Add tests for your own happy paths, invalid inputs, authorization failures, cancellation, repeated actions, and cleanup.
- Exercise your UI in a real browser, including navigation away while a request is pending.
- Check that no route, tool, log, or UI initialization leaks secrets.
- Try install, explicit enable, grant, use, disable, update, and uninstall in development.
- Check retained settings/data and document migration or deletion behavior.

The supplied integration test uses in-memory storage and direct tool invocation. Add real deployment checks for encrypted storage and per-agent grant enforcement when those guarantees matter to your mod.

## Match version and tag

Accepted tag forms are `YYYY.MM.DD[.N]`, SemVer, and either form prefixed with `v`. The manifest version must equal the tag after removing its optional `v`.

For example, manifest version `2026.10.21` matches tag `2026.10.21` or `v2026.10.21`. A branch push alone is not an installable release.

Publish through your repository’s intended release process, then verify the accepted tag is discoverable and the tagged snapshot contains the matching manifest and entry files. Refresh the Git source in Burrow and test that exact tagged version.

## Tell users what you support

Document required Core versions, granted tools, data retention, any migration steps, known limitations, and the tests you actually ran. Burrow currently has no manifest-level Core version range, so avoid untested compatibility promises.

Keep the public contract and reference implementation in sync when interfaces change. Preserve license/copyright notices and follow the license’s requirements for modified copies.

