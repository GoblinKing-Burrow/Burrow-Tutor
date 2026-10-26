# Run and test Tutor

[Back to Burrow Tutor](index.md)

Use Node.js 22.13 or newer. The reference package has no third-party dependencies to install.

## Check syntax

From the repository root:

```sh
npm run build
```

Despite its name, this command checks the syntax of the Beginner and Advanced server modules, Forge scaffold, Control, Settings, Archive, and standalone UI examples. It does not compile files or produce a distributable bundle.

## Run the isolated tests

```sh
node --test test/server.test.mjs test/ui.test.mjs test/forge-images.test.mjs test/advanced-capabilities.test.mjs test/advanced-ui-contracts.test.mjs
```

The current source defines 22 isolated tests (counted from declarations, not rerun in this review). They cover route/tool registration, public status, secret write/clear behavior, configuration authorization and malformed input, tool validation/cancellation, Control refresh/cleanup, Settings save/clear/cleanup, and UI error feedback.

Forge scaffold tests also cover paid consent, trusted identity, exact input fields, failed intent writes preventing dispatch, lost receipt recovery across reload, and sanitized failure responses.

Advanced cases also cover identity/conversation/model forwarding, scheduler defaults and ownership fields, diagnostics, sensitive and managed protected results, persistent notes, declarative Settings, `apiTargets`, and Archive mounting/cleanup.

The UI tests use a lightweight fake DOM. They do not launch a browser.

## Run against Core

Arrange the checkouts as siblings:

```text
workspace/
  Burrow-Tutor/
  Burrow-Backend/
```

Then run:

```sh
npm test
```

For another Core location:

```sh
BURROW_CORE_ROOT=/absolute/path/to/Burrow-Backend npm test
```

To run only the three integration tests:

```sh
npm run test:core
```

Install the dependencies required by the selected Core backend checkout before running this test. Tutor itself has no dependencies, but its Core host does.

The public [Burrow repository](https://github.com/GoblinKing-Burrow/Burrow) includes that backend under `backend/`. For example:

```sh
BURROW_CORE_ROOT=/absolute/path/to/Burrow/backend npm test
```

The integration test imports Core’s mod discovery and host modules, copies the reference into a temporary runtime, discovers it, activates it, and invokes its status route and greeting tool. It checks that Core assigns the tool `grant-required` availability. A second integration test exercises the real forked-host Forge transport and capability service: saved-selection availability, mod ownership, asynchronous receipts, stable retry across reload, and sanitized artifact previews. Its Forge store is an in-memory fixture; no paid provider is called. A third test hosts the Advanced entrypoint separately and exercises identity/timezone, conversation paging, models, scheduler CRUD/history/triggering, invocation-scoped diagnostics, and protected declaration/resolution through the current Core host with controlled stores and a local provider fixture.

## Historical verified snapshot

On 22 October 2026, the reviewed Tutor source was `e95fe672` (`2026.10.22.2`), including advanced lesson commit `23afbd0`; the reviewed Core source was `3304e633`. Syntax checks and all **24 tests passed** on Node.js 24.19.0: 21 isolated tests and three Core integration tests. Eleven focused Core Forge/model/timezone tests also passed. See the [capability coverage matrix](../advanced/coverage.md) for exactly which implementation paths those tests exercise and which they only register.

These checks do not establish tagged installation readiness, live paid-provider or PostgreSQL operation, real-browser behavior, or compatibility with an older installed Core.

## Current source review

The 25 October 2026 full documentation review inspected Tutor `9679fc4fe9ccd532142b84b0257d290ae8d9eec3` (2026.10.25) and Core `3bf50374d3601c821e787912d52b9044eaf649ec`, including external-agent turns, durable generation examples and the Tutor UI label. No application tests were run in this pass; the earlier 24-pass execution receipt remains historical, not a pass claim for this newer commit. External-turn coverage uses the real Core dispatcher with in-memory receipts and a controlled executor. Durable-generation route coverage uses a fake generation dispatcher; live-provider and restart behavior are not established by that fixture.

## CI coverage

The verification workflow runs the server/UI subset and a conditional Core integration step. It does not run the complete Forge/Advanced/Advanced-UI isolated suites. A green workflow is therefore not evidence that the complete test suite ran. Run the complete commands above for a local release check; inspect the integration step to distinguish a pass from unavailable Core checkout access.

## What passing tests establish

A passing isolated suite checks the supplied example in its fixtures. A passing integration test additionally checks the supplied Core checkout. Neither establishes compatibility with every Core release.

These tests do not replace live install/enable/update/disable/uninstall checks, real-browser checks, encrypted-storage verification, or a real agent-grant flow. See the [release checklist](release.md).

If the integration test cannot import Core modules, check the sibling directory or `BURROW_CORE_ROOT`, then follow that Core checkout’s own setup instructions. Do not interpret a missing Core checkout as a failure of the isolated tests.

## Delta review

On 26 October 2026, a delta review checked Tutor `e9805f5a50a49b831dc29a757ae511ef916ded11` (2026.10.25.1) against Core `4df4b424e2b2856cb2c25c8464da7f806eb661e0`. Tutor runtime examples are unchanged since the full review. The checked-in Core integration test now releases its deliberately held turn before teardown and expects Core’s default `displayMessage` metadata. This fixes fixture cleanup/expectations; it is not a new runtime capability or a test pass reported by this documentation review. No application tests were run.
