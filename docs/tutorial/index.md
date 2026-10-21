# Burrow Tutor: build your first mod

![Fred, the lime-green Burrow Tutor goblin, teaching mod development](../assets/hero.png)

**Learn the rules. Build the mischief.**

Fred is your tutor. His first lesson: cleanup hooks are a sign of character.

Burrow Tutor puts the public third-party mod contract beside a small reference mod you can read, test, and adapt. It uses plain JavaScript ESM, no framework, no third-party package dependencies, and no generated build source.

## Start here

1. [Run and test Tutor](testing.md).
2. [Install and try the reference mod](install.md).
3. [Understand how the example works](walkthrough.md).
4. [Read the mod author contract](contract.md).
5. [Adapt and release your own mod](release.md).

## What you need

- Node.js 22.13 or newer.
- Git to clone the repository.
- A Core backend checkout for the full test suite and current-Core integration test (the `backend/` directory in the public Burrow repository works). You can run the isolated server/UI tests without it.
- A development Burrow installation to try the complete mod lifecycle.

```sh
git clone https://github.com/GoblinKing-Burrow/Burrow-Tutor.git
cd Burrow-Tutor
```

## Find your way around

- `burrow.mod.json`: identity, version, server/UI entry points, and Settings contribution.
- `server/index.mjs`: activation, routes, public settings, write-only secrets, one agent tool, and cleanup.
- `ui/control.js`: status panel and refresh.
- `ui/settings.js`: configuration form and cleanup.
- `test/`: server, lightweight UI, and current-Core integration tests.
- `docs/mod-contract.md`: the canonical public contract.

The repository name is Burrow-Tutor. The installed example’s manifest ID is `burrow-reference-mod`, and its display name is **Burrow Reference Mod**.

## Before you install

Mods are trusted executable server/browser code. A forked host limits faults and exposed Core APIs; it is not an operating-system sandbox. Install only code you trust. Installation does not grant agent tools.

The inspected source declares version `2026.10.21`. Public source availability alone does not establish that an installable tag exists; see the [installation readiness note](install.md#release-readiness).

[Browse the source](https://github.com/GoblinKing-Burrow/Burrow-Tutor) · [Read the license](../../LICENSE)
