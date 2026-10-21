<p align="center">
  <img src="docs/assets/hero.png" width="720" alt="Fred, the lime-green Burrow Tutor goblin, teaching Burrow mod development" />
</p>

# Burrow Tutor

**Learn the rules. Build the mischief.**

Burrow Tutor is the standalone starting point for building ordinary third-party Burrow mods. It keeps the public author contract and a deliberately boring, installable reference mod together in one cloneable repository.

Fred is your tutor. Fred believes cleanup hooks are a sign of character.

## What's here

- [`docs/mod-contract.md`](docs/mod-contract.md) — the public third-party mod contract.
- [`burrow.mod.json`](burrow.mod.json) — a validated manifest.
- [`server/index.mjs`](server/index.mjs) — activation, cleanup, JSON routes, settings, encrypted write-only secrets, and one grant-required agent tool.
- [`ui/`](ui/) — minimal Control and Settings modules.
- [`test/`](test/) — focused unit, UI, and current-Core integration tests.

FIFO will grow the teaching documentation around these canonical inputs. The example intentionally uses no private Kingdom code, privileged system capabilities, framework, or generated build source.

## Clone

```sh
git clone https://github.com/GoblinKing-Burrow/Burrow-Tutor.git
cd Burrow-Tutor
```

## Verify

Requires Node.js 22.13 or newer and a sibling `Burrow-Backend` checkout. Override the Core location with `BURROW_CORE_ROOT`.

```sh
npm run build
npm test
```

## Install the reference mod

1. Open **Settings → Mods → Mod sources**.
2. Add `https://github.com/GoblinKing-Burrow/Burrow-Tutor.git`.
3. Refresh, install a tagged version, then explicitly enable it.
4. Grant `reference_greet` through ordinary per-agent MCP grants before expecting an agent to call it.

Installation does not grant tools. Mod code is trusted executable code, not an operating-system sandbox; install only code you trust.
