# Understand the reference mod

[Back to Burrow Tutor](index.md)

Read this alongside the [server](../../server/index.mjs), [manifest](../../burrow.mod.json), and [UI modules](../../ui).

## Manifest first

The root `burrow.mod.json` declares `burrow-reference-mod`, version `2026.10.21`, server entry `server/index.mjs`, and Control/Settings UI entries. Its `configuration` Settings contribution declares navigation/primary titles and `primary.capability: "settingsUi"`.

When you adapt it, choose a unique lowercase-kebab ID. The ID must match the install directory and cannot be `mod-data`. Storage is bound to that identity.

## Activate and register

The server exports `activate(context)`. It registers two routes and one tool, logs activation, and returns a cleanup function that logs shutdown.

Registration happens during activation. A real mod must release any resources it creates during cleanup. This example has no server timer or long-running background work to stop.

## Public status

`GET /status` is scoped beneath `/api/mods/burrow-reference-mod`. It returns `ok`, the current greeting, and `secretConfigured`, with a no-store cache header.

The greeting lives in namespaced settings under `greeting`. The secret is stored under `example-secret`; status calls `secrets.has`, never reads or returns its value.

## Validate before saving

`PUT /configuration` accepts a JSON object with a required greeting and optional secret. It rejects unknown properties, wrong types, blank/overlong greetings, and overlong secrets.

It trusts Core’s request auth context. With auth enabled, an unauthenticated operator request is rejected. With auth disabled, the example allows the write. Request-body claims cannot substitute for Core identity.

Secret handling is deliberate:
- Omitted `secret`: keep the existing value.
- Non-empty string: replace it.
- Empty string: clear it.

Success returns public status only. Validation failures return 400; failed operator authentication returns 401; unexpected failures return a generic `internal_error` response.

## A grant-required tool

`reference_greet` declares an object schema with exactly one required string field, `name`, and no additional properties. Core validates the schema; the handler also trims and validates the name.

The handler checks the caller’s abort signal before reading the current greeting. It returns public JSON with the combined message. It does not expose the secret.

The example omits an explicit availability override, so the ordinary default is `grant-required`. The integration test checks that Core applies it.

## Mount and unmount the UI

Control exports `mountControl({root, api})`. Settings exports `settingsSections` and `mountSettings({section, primary, api})`.

Both use the scoped `api` helper, validate response shapes, display errors, and keep an AbortController. Cleanup aborts requests, removes listeners, and removes mounted content. A mounted flag prevents late responses from updating a departed UI.

Settings ignores unknown sections. Its form clears the secret input after saving and never initializes it from a stored value.

## What this example does not demonstrate

The public contract also describes Archive UI, generic Core capabilities, scheduler jobs, advanced tool authorization, and persistent files. Tutor does not implement those features. Do not treat their absence as a promise that they are unsupported, or this example’s tests as coverage of them.

