# Advanced lessons

[Back to the beginner path](../tutorial/index.md) · [Canonical Tutor contract](../mod-contract.md) · [Coverage matrix](coverage.md)

These are the Advanced lessons within Burrow Tutor. Begin with the small reference mod, then choose the capabilities your own mod needs. These pages are focused guides to Burrow's current **ordinary third-party** capabilities. The installed Tutor manifest continues to run only the Beginner entrypoint. The separate runnable server laboratory starts at [`server/advanced/index.example.mjs`](../../server/advanced/index.example.mjs), with Archive UI in `ui/archive.js` and focused tests in `test/advanced*.test.mjs`.

The [public Tutor contract](https://github.com/GoblinKing-Burrow/Burrow-Tutor/blob/main/docs/mod-contract.md) remains the author-facing reference. These lessons are checked against Core implementation and tests; the [coverage matrix](coverage.md) records which behaviors were actually exercised and which remain unverified.

## Capability map

1. [Agents and operator metadata](agents-operator.md)
2. [Externally initiated agent turns](external-agent-turns.md)
3. [Conversation inventory and complete reads](conversations.md)
4. [Models and isolated text generation](models.md)
5. [Owner-scoped scheduler jobs](scheduler.md)
6. [Diagnostics: mod adapters and tool-scoped runtime reads](diagnostics.md)
7. [Persistent mod-data](persistent-data.md)
8. [Advanced tools and protected results](tools-protected-results.md)
9. [UI contributions: Control, Settings, and Archive](ui-contributions.md)
10. [Forge images](forge.md)
11. [Lifecycle, concurrency, cancellation, and errors](lifecycle-concurrency-errors.md)
12. [Contract/source/docs/test coverage](coverage.md)

## Try the runnable examples

Beginner and Advanced are sections of the same Tutor repository. Installing the shipped manifest still runs `server/index.mjs`, with Control and Settings; it does not turn on the Advanced lab or Archive pane.

For hands-on Advanced work:

1. Clone Tutor and run the [syntax, isolated, and Core checks](../tutorial/testing.md).
2. In your development copy, choose a unique mod ID/name and set the manifest `server` to `server/advanced/index.example.mjs`.
3. Keep its three sibling modules: `core-capabilities.mjs`, `diagnostics-tools.mjs`, and `persistent-data.mjs`.
4. Remove Beginner UI/contribution declarations unless you adapt them: the Advanced entrypoint does not serve Beginner `/status` or `/configuration` routes. To try Archive, declare `ui.archive: "ui/archive.js"`; it reads Advanced scheduler routes.
5. Follow the normal [development installation and enablement steps](../tutorial/install.md). Begin with read-only identity/model/inventory calls. Generation requires explicit paid-work confirmation; scheduler jobs start disabled.

The declarative Settings and `apiTargets` files are standalone examples, not registered by this entrypoint. The [Forge lesson](../tutorial/forge-images.md) uses the Beginner scaffold. Pick the pieces you need rather than enabling every example in a live installation.

## Ordinary/privileged boundary

Everything taught in this track is available to an ordinary mod unless a section says it is a boundary or non-goal. Do **not** copy privileged examples into an ordinary manifest:

- `system: true` is a trust classification, not an ordinary feature flag.
- `systemCapabilities` is forbidden for regular mods.
- `context.modManagement` (`mod-management-v1`) and `context.processExecution` (`execution-provider-v1`) are privileged Core-integration interfaces.
- Installation, a tool grant, or `availability: 'mod-authorized'` never grants those interfaces.

Tutor intentionally describes those names only to prevent accidental misuse. Consult Core's privileged integration documentation if you are building Core infrastructure rather than a third-party mod.

## Documentation status and future skill

The coverage matrix names the expected runnable advanced paths so documentation, implementation, and tests can move together. A future release may package these lessons in a repository `SKILL.md` for agent-guided authoring. Do not create or depend on that file yet; it is not part of today's mod contract.
