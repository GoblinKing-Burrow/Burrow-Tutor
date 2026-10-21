# Run and test Tutor

[Back to Burrow Tutor](index.md)

Use Node.js 22.13 or newer. The reference package has no third-party dependencies to install.

## Check syntax

From the repository root:

```sh
npm run build
```

Despite its name, this command checks the syntax of the server, Control, and Settings modules. It does not compile files or produce a distributable bundle.

## Run the isolated tests

```sh
node --test test/server.test.mjs test/ui.test.mjs
```

These eight tests cover route/tool registration, public status, secret write/clear behavior, configuration authorization and malformed input, tool validation/cancellation, Control refresh/cleanup, Settings save/clear/cleanup, and UI error feedback.

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

To run only the integration test:

```sh
npm run test:core
```

The integration test imports Core’s mod discovery and host modules, copies the reference into a temporary runtime, discovers it, activates it, and invokes its status route and greeting tool. It checks that Core assigns the tool `grant-required` availability. Its backing store is an in-memory fixture.

## What passing tests establish

A passing isolated suite checks the supplied example in its fixtures. A passing integration test additionally checks the supplied Core checkout. Neither establishes compatibility with every Core release.

These tests do not replace live install/enable/update/disable/uninstall checks, real-browser checks, encrypted-storage verification, or a real agent-grant flow. See the [release checklist](release.md).

If the integration test cannot import Core modules, check the sibling directory or `BURROW_CORE_ROOT`, then follow that Core checkout’s own setup instructions. Do not interpret a missing Core checkout as a failure of the isolated tests.

