<p align="center">
  <img src="docs/assets/hero.png" width="720" alt="Fred, the lime-green Burrow Tutor goblin, teaching Burrow mod development" />
</p>

# Burrow Tutor

**Learn the rules. Build the mischief.**

Burrow Tutor is the standalone starting point for building ordinary third-party Burrow mods. It keeps the public author contract and a deliberately boring, installable reference mod together in one cloneable repository.

Fred is your tutor. Fred believes cleanup hooks are a sign of character.

## What's here

- [`docs/mod-contract.md`](docs/mod-contract.md) — the public third-party mod contract.
- [`docs/advanced/`](docs/advanced/index.md) — clearly separated advanced ordinary-mod capabilities, examples, and coverage map.
- [`docs/forge-images.md`](docs/forge-images.md) — ordinary-mod Forge image lesson: saved selection, paid consent, durable requests, later polling, and safe previews.
- [`burrow.mod.json`](burrow.mod.json) — a validated manifest.
- [`server/index.mjs`](server/index.mjs) — the small installed Beginner example: activation, cleanup, JSON routes, settings, encrypted write-only secrets, one grant-required tool, and the focused Forge lesson.
- [`server/forge-images.mjs`](server/forge-images.mjs) — copyable, disabled-by-default image route scaffold using current Core’s generic facade (no provider credentials or privileged capabilities).
- [`ui/`](ui/) — minimal Control and Settings modules.
- [`test/`](test/) — focused unit, UI, and current-Core integration tests.

There is no separate lesson engine or code generator yet: the public contract, focused lessons, and runnable reference modules are the canonical author/scaffolding inputs. The example intentionally uses no private Kingdom code, privileged system capabilities, framework, or generated build source.

## Beginner path

Start with [Build your first mod](docs/tutorial/index.md): run the small reference, install it, read its server/UI walkthrough, then adapt and release it. You do not need the advanced examples to complete that path.

## Advanced capability track

After the beginner path, use the [Advanced ordinary-mod capabilities](docs/advanced/index.md) track for agents and operator metadata, externally initiated agent turns, conversations, model execution, scheduler jobs, both diagnostics interfaces, persistent mod-data, protected tool results, Forge, Archive and the other UI surfaces, and lifecycle/concurrency/error behavior. Its separate [`server/advanced/index.example.mjs`](server/advanced/index.example.mjs) entrypoint composes the runnable Advanced server modules without activating them in the installed Beginner mod. The [coverage matrix](docs/advanced/coverage.md) maps the upstream contract to source, lessons, unit tests, and current-Core checks.

> **Ordinary/privileged boundary:** the advanced track is still for ordinary third-party mods. `system: true`, `systemCapabilities`, `context.modManagement`, and `context.processExecution` are privileged Core-integration contracts and are deliberately not taught as ordinary APIs.

A future release may add a repository `SKILL.md` so an agent can consume these lessons directly. It is not part of the current repository or contract.

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
npm run test:core # explicit current-Core contract check (also included in npm test)
```

## Install the reference mod

1. Open **Settings → Mods → Mod sources**.
2. Add `https://github.com/GoblinKing-Burrow/Burrow-Tutor.git`.
3. Refresh, install a tagged version, then explicitly enable it.
4. Grant `reference_greet` through ordinary per-agent MCP grants before expecting an agent to call it.

Installation does not grant tools. Mod code is trusted executable code, not an operating-system sandbox; install only code you trust.

## Optional paid image scaffold

The reference mod registers `/images/status`, `/images/configuration`, `/images`, and `/images/jobs/:jobId` beneath its mod namespace. Image submission starts **disabled**, requires operator opt-in plus confirmation for each potentially paid request, and is not wired to an automatic UI action or agent tool. Existing greeting/secret UI behavior is unchanged.

Follow the [Forge image lesson](docs/forge-images.md) before adapting it. The scaffold uses only `context.forge.images.status()`, `context.forge.images.create({ prompt, idempotencyKey })`, and `context.forge.jobs.read(jobId)`: Core uses the operator's saved selection, namespaces stable request keys, and permits only same-mod image reads. It persists job IDs and returns asynchronous receipts; inspect jobs later. Authenticated `previewUrl` is for previews, not downloads. No cancellation, attachments, non-image generation, provider selection, or Forge configuration mutation is available.

Tests use the real current-Core host/capability service with an in-memory Forge store: they make no paid provider calls and do not validate live provider or PostgreSQL operation.
