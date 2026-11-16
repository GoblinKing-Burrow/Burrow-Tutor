# Native identities, context, portraits and activity

[Advanced index](index.md) · [Coverage matrix](coverage.md)

The standalone [`server/advanced/native-agents.example.mjs`](../../server/advanced/native-agents.example.mjs) is an **alternative** Advanced server entrypoint, not the installed Beginner server. Copy it into your own mod and set `server` in your manifest to that file. It registers providers and catches up completion metadata on activation, but creates no identities and calls no model. Shared guidance affects fresh native turns while that mod is enabled; deliberately review the text before enabling. Do not install two copies with the same identity.

## Operator exercise

All routes require Core's trusted operator authentication (or explicitly disabled Core auth). Route errors are intentionally generic. Use the scoped UI API or an authenticated development client:

1. `GET /advanced/native` returns owned identities, an `includeHidden:true` directory, live activity and the saved completion cursor.
2. `POST /advanced/native` with the following JSON creates an identity using an **existing authenticated selected native model**, not a new provider configuration:

   ```json
   {"id":"tutor-resident","name":"Tutor Resident","modelConnectionId":"YOUR_CONNECTION","model":"YOUR_SELECTED_MODEL","capabilities":{"a2a":true},"visibility":{"agents":false,"chat":false}}
   ```

3. `GET /advanced/native/tutor-resident` reads it; `PATCH` that path with `{"visibility":{"chat":true},"capabilities":{"forge":true}}` preserves omitted flags. Ownership cannot be supplied/adopted. Flags are only `a2a`, `forge`, `brains`, `mcp`, `skills`; visibility only `agents`, `chat`; omitted create flags default false. Neither hiding an identity nor showing it is authorization. No engineering/shell/file/git/task/minion grant follows. This lab does not dispatch a paid turn or implement identity deletion.
4. `PUT /advanced/native/tutor-resident/portrait` with `{"fileName":"portrait.png","content":"data:image/png;base64,..."}` saves the original canonical native portrait. `GET` reads metadata, `DELETE` removes it. Use a real PNG/JPEG/WebP, maximum 20 MiB. This is distinct from chat `avatar`, updated with `PATCH {"avatar":"..."}`; creation does not accept avatar. Foreign/regular identities fail closed.
5. The same GET/PUT/DELETE protocol at `/advanced/references/character-key` demonstrates **mod-keyed** canonical Forge portraits. These are character references, not native identities. Returned `contentUrl` is authenticated, not a public download. Core retains links across reload/update/uninstall; replacement/removal cleans prior owned bytes. To generate later, use `forge.images.create({prompt,idempotencyKey,referenceImages:[{key,id,name}]})` with the exact current revision. This lab intentionally does not generate: preserve ordered references and stable paid intent keys, and fail visibly rather than falling back to text-only generation when a reference/model is unavailable.

## Per-turn and shared context

The owner provider returns `profileFiles` identity/system records and `context` current support records. It receives trusted `agentId`, logical `sessionId` and cancellation. Core resolves it on each dependent turn. Missing/crashed/disabled/replaced providers and invalid output block with `mod_agent_unavailable`. Records are `{name,content}` strings: names are bounded non-path identifiers, unique per collection; maximum 64 records per collection and 1,000,000 total UTF-8 bytes. No tools/authority fields are accepted. Prompt rendering has separate explicit budgets and can still fail over capacity. Core provenance distinguishes `mod-agent-profile-provider` and `mod-agent-context-provider`; these are not editable workspace profiles and do not load the engineering kernel/Dream preload.

The independent `registerShared` provider returns **only** `context`. Enabled published mods contribute in mod-ID order to ordinary native/resident/A2A recipient turns. It grants no ownership or tools, never replaces identity, and renders as separate developer guidance with `mod-shared-context-provider` provenance. Revocation removes it from fresh turns; earlier snapshots are history, not current instructions. Compression retains the captured current-turn contribution. This lab tests resolution, not prompt rendering/compression or actual inference.

## Completion catch-up and activity

`runs.onCompleted` receives advisory `{cursor}` wakes, **not events**. The lab catches up on activation and every wake with `runs.list({cursor,limit:100})`, serializes overlapping calls, advances across every event and persists `native-run-cursor` in mod settings. Failed wakes do not poison later catch-up; delivery may be lost/replayed, so reload catch-up matters. It consumes metadata only: adding follow-on work requires durable idempotency/admission and atomic application decisions beyond this checkpoint example.

Events contain cursor, agent/session/run IDs, Core-derived source/origin/peer identity, start/completion times, duration and outcome—not transcripts/tools/credentials. Completion is not proof that the HTTP response has finished. `runs.activity` reports `running`, `cancelling`, or `response_pending`; the latter is transport busy, **not an active model**. Observation is not reservation. Retention has no automatic per-mod acknowledgement/deletion policy.

## Settings layout and selection

[`ui/entity-settings.example.js`](../../ui/entity-settings.example.js) is an alternative imperative `ui.settings` module. Declare a matching `residents` Settings section in your manifest; its exported `settingsSections` adds semantic `form-wide` layout metadata. Other host layouts include `form`, `document`, and `form-inventory`; they do not add new permissions or surfaces. The module receives `primary`, enabled-agent inventory and `setEntitySelector({label,items:[{id,label,disabled?}],selectedId,onSelect,addLabel?,onAdd?})`. It publishes a selection, rejects unknown/disabled IDs and clears selector/surface on cleanup. Add/load persistence and mutation authorization belong to the product, not this local selection demo. Use a custom owned inventory from your scoped API when panel-hidden residents must be selectable; the host's `agents` input is not promised to include hidden residents.

These UI shapes were read from current sibling UI `ModSettingsHost.tsx`/`SettingsEntitySelector.tsx`, not inferred from Backend capability APIs. The lightweight test checks module output/callback/cleanup; it does **not** mount the React host, verify browser layout, accessibility or responsive behavior.

## Verification boundary

`test/native-core-contract.test.mjs` uses the actual current Core forked host, capability service, registry normalization, portrait upload validator and live provider resolver. Stores (including model selections, portraits and completion rows) are controlled in-memory adapters. It checks auth, ownership, closed flags, hidden directory opt-in, provider/session resolution, pre-aborted cancellation, shared revocation, checkpoint paging/replayed wakes, portrait CRUD and activity transport state. It does not prove transactional PostgreSQL model selection/flag persistence, artifact storage/lifetime/attachment reopening, reference-conditioned generation, production feed publication/deduplication/HTTP-finish gates, native tool offering, prompt provenance rendering, restart recovery or browser mounting. No paid provider is called.
