# Product Requirements Document (PRD)
**Repository**: `https://github.com/dbenedetti-trimble/ada-nodejs-test-fastify`

---


# Context & Problem


## Problem statement

- **Who is affected?** Developers using Fastify who encounter error messages during development, particularly those new to the framework or its encapsulation/lifecycle model.
- **What is the issue?** Several Fastify error paths produce messages that state _what went wrong_ but not _why it happened_ or _what to do about it_. Developers hit these errors, then spend time searching docs or GitHub issues for context that the error itself could provide.
- **Why does it matter?** Actionable error messages reduce time-to-fix and are a hallmark of well-maintained frameworks. These improvements are low-risk, high-value changes that touch error paths (not hot paths), so performance is not a concern.

## Success metrics


|                        Metric                        |         Baseline         |                                 Target                                  |     Validation method     |
| ---------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- | ------------------------- |
| "Already started" errors include actionable guidance | No guidance in message   | Every `FST_ERR_INSTANCE_ALREADY_LISTENING` throw includes a suggestion  | Unit tests                |
| Async hook arity errors identify the hook            | Hook name not in message | Hook name included in all `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` messages | Unit tests                |
| Forgotten response detection                         | Request hangs silently   | Warning logged when async handler resolves without sending response     | Unit + integration tests  |
| All existing tests pass                              | 100% pass                | 100% pass (no regressions)                                              | `npm run unit`            |
| Type definitions updated                             | N/A                      | New error codes typed in `types/errors.d.ts`                            | `npm run test:typescript` |


# Scope & Constraints


## In scope

- Enhancing existing error messages with actionable context (3 specific improvements below)
- Adding one new warning for a common silent failure
- Adding unit tests for all new/changed error behaviors
- Updating TypeScript type definitions for any new error codes
- Updating any relevant JSDoc comments

## Out of scope

- Changing error codes (all existing `FST_ERR_*` codes remain the same)
- Changing HTTP status codes for any error response
- Adding new dependencies
- Performance-sensitive code paths (all changes are in error/validation paths)
- Documentation site changes (docs/ directory)

## Dependencies & Risks

- **Backwards compatibility**: Error _messages_ are not part of the semver contract, but error _codes_ are. This PRD only changes message text and adds new codes/warnings. No breaking changes.
- **Test runner**: Tests must use `node:test` (via `borp`), matching the existing test infrastructure. Do not introduce Jest, Mocha, or other test runners.
- **Error creation pattern**: All errors must use `createError` from `@fastify/error`, following the existing pattern in `lib/errors.js`.

# Functional Requirements


## IMP-1: Enhance "already started" error messages


**Current behavior:**


When a developer calls `addHook()`, `route()`, `register()`, `setErrorHandler()`, or similar methods after the server has started, Fastify throws `FST_ERR_INSTANCE_ALREADY_LISTENING` with the message:


```javascript
Cannot call "addHook" when fastify instance is already started!
```


This tells you what failed but not how to fix it.


**Required behavior:**


Enhance the error message to include actionable guidance. The existing error code `FST_ERR_INSTANCE_ALREADY_LISTENING` should be kept, but the message format should be updated to:


```javascript
Cannot call "%s" when fastify instance is already started! Move this call inside a plugin register function so it executes before the server starts.
```


**Acceptance criteria:**

- The error message for `FST_ERR_INSTANCE_ALREADY_LISTENING` includes guidance text about moving the call inside a plugin
- Error code remains `FST_ERR_INSTANCE_ALREADY_LISTENING` (unchanged)
- All existing tests that assert on this error code still pass
- Tests that assert on the exact message string are updated to match the new message
- New tests verify the enhanced message appears for at least: `addHook`, `route` (via shorthand like `.get()`), and `register`

## IMP-2: Include hook name in async arity validation errors


**Current behavior:**


When a developer writes an async hook function with too many arguments (accidentally including the `done` callback), Fastify throws `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` with:


```javascript
Async function has too many arguments. Async hooks should not use the 'done' argument.
```


This doesn't tell you _which_ hook has the problem, which is painful when you have many hooks registered.


**Required behavior:**


Update the error message to include the hook name:


```javascript
Async function for "%s" hook has too many arguments. Async hooks should not use the 'done' argument.
```


Where `%s` is the hook name (e.g., `onRequest`, `preHandler`).


**Acceptance criteria:**

- `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` message includes the hook name as the first parameter
- Error code remains `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` (unchanged)
- All call sites that throw this error pass the hook name as a parameter
- This applies to both application-level hooks (`fastify.addHook(name, fn)`) and route-level hooks (hooks defined in route options)
- New tests verify the hook name appears in the error message for at least 3 different hook types (e.g., `onRequest`, `preSerialization`, `onSend`)
- Existing tests that assert on this error code still pass (update message assertions as needed)

## IMP-3: Warn when async route handler resolves without sending a response


**Current behavior:**


When an async route handler returns `undefined` and doesn't call `reply.send()`, the request hangs until the client times out or the connection is closed. This is a very common mistake, especially for developers coming from Express where `res.end()` forgetting is also silent.


Example of buggy handler:


```javascript
fastify.get('/users/:id', async (request, reply) => {
  const user = await db.getUser(request.params.id)
  if (!user) {
    reply.code(404).send({ error: 'Not found' })
    return
  }
  // BUG: forgot to return user or call reply.send(user)
  // Request hangs forever on the happy path
})
```


**Required behavior:**


Add a new process warning (following the `FSTDEP0xx` / `FSTWRN0xx` pattern in `lib/warnings.js`) that fires when an async route handler's promise resolves with `undefined` AND `reply.sent` is `false`. The warning should:

1. Use Fastify's existing warning infrastructure (`lib/warnings.js` pattern)
2. Fire a process warning with a clear message identifying the route
3. NOT change the behavior (the request still hangs -- the warning helps the developer find the bug)
4. Only fire once per route pattern (using the standard warning deduplication)

Warning message format:


```javascript
Route handler for "%s %s" resolved without sending a response. Return a value from the handler or call reply.send() explicitly.
```


Where the first `%s` is the HTTP method and the second is the route URL pattern.


**Acceptance criteria:**

- A new warning code is added to `lib/warnings.js` following the existing naming convention
- The warning fires when an async handler returns `undefined` without calling `reply.send()`
- The warning includes the HTTP method and route URL pattern
- The warning does NOT fire when:
	- The handler returns a non-undefined value (Fastify auto-sends it)
	- The handler explicitly calls `reply.send()` before returning
	- The handler returns `reply` (common Fastify pattern for explicit sends)
- The warning fires only once per route (standard process.emitWarning deduplication)
- New tests verify warning emission for the buggy case
- New tests verify NO warning for the correct cases
- The warning is added to the `FASTIFY_WARNINGS` object in `lib/warnings.js`

# Technical Solution


## Architecture & Components


All changes are in existing files. No new files are created.


**Modified files:**


|          File          |                                                  Change                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `lib/errors.js`        | Update `FST_ERR_INSTANCE_ALREADY_LISTENING` message, update `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` message |
| `lib/warnings.js`      | Add new `FSTWRN_ROUTE_HANDLER_NO_RESPONSE` warning (or whatever code follows the existing sequence)      |
| `lib/wrap-thenable.js` | Add undefined-return detection after promise resolution                                                  |
| `fastify.js`           | Pass hook name to `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` at all throw sites in `addHook()`                 |
| `lib/route.js`         | Pass hook name when validating route-level hook arity                                                    |
| `types/errors.d.ts`    | Update error constructor types if message signatures change                                              |
| `test/`                | New and updated test files                                                                               |


## Implementation notes


**IMP-1 (already started errors):**


The `throwIfAlreadyStarted` helper in `fastify.js` creates and throws `FST_ERR_INSTANCE_ALREADY_LISTENING`. The message template in `lib/errors.js` needs updating. The helper already receives a string parameter for the operation name, so no call-site changes are needed beyond the template.


**IMP-2 (hook name in arity errors):**


In `fastify.js`, the `addHook` method validates async function arity. The hook name is available as the first argument to `addHook(name, fn)`. Pass it through to the error constructor. Similarly, in `lib/route.js` where route-level hooks are validated, the hook name is known from the property key being iterated.


**IMP-3 (no-response warning):**


In `lib/wrap-thenable.js`, the `wrapThenable` function handles the promise returned by async handlers. After the promise resolves, if the result is `undefined` and `reply.sent` is false, emit the warning. The route method and URL should be available from the request/reply context. Use `process.emitWarning` with the warning code, matching the pattern used in `lib/warnings.js`.


## Dependency changes


None. All changes use existing dependencies and patterns.


# Validation Contract


## VAL-01: Enhanced "already started" error for addHook


```javascript
GIVEN a fastify instance that has been started via listen()
WHEN I call fastify.addHook('onRequest', handler)
THEN the error code is FST_ERR_INSTANCE_ALREADY_LISTENING
AND the error message contains "addHook"
AND the error message contains "inside a plugin register function"
```


## VAL-02: Enhanced "already started" error for route registration


```javascript
GIVEN a fastify instance that has been started via listen()
WHEN I call fastify.get('/test', handler)
THEN the error code is FST_ERR_INSTANCE_ALREADY_LISTENING
AND the error message contains guidance about plugin registration
```


## VAL-03: Hook name in async arity error (application hook)


```javascript
GIVEN a fastify instance
WHEN I call fastify.addHook('onRequest', async (request, reply, done) => {})
THEN the error code is FST_ERR_HOOK_INVALID_ASYNC_HANDLER
AND the error message contains "onRequest"
```


## VAL-04: Hook name in async arity error (route-level hook)


```javascript
GIVEN a fastify instance
WHEN I register a route with preHandler: [async (request, reply, done) => {}]
THEN on ready(), the error code is FST_ERR_HOOK_INVALID_ASYNC_HANDLER
AND the error message contains "preHandler"
```


## VAL-05: Hook name in async arity error for onSend (4-param hook)


```javascript
GIVEN a fastify instance
WHEN I call fastify.addHook('onSend', async (request, reply, payload, done) => {})
THEN the error code is FST_ERR_HOOK_INVALID_ASYNC_HANDLER
AND the error message contains "onSend"
```


## VAL-06: No-response warning fires for forgotten reply.send()


```javascript
GIVEN a route with an async handler that returns undefined without calling reply.send()
WHEN a request hits that route
THEN a process warning is emitted
AND the warning message contains the HTTP method and route URL
AND the warning message suggests returning a value or calling reply.send()
```


## VAL-07: No warning when handler returns a value


```javascript
GIVEN a route with an async handler that returns { hello: 'world' }
WHEN a request hits that route
THEN no process warning is emitted
AND the response body is { hello: 'world' }
```


## VAL-08: No warning when handler calls reply.send() explicitly


```javascript
GIVEN a route with an async handler that calls reply.send({ hello: 'world' }) and returns undefined
WHEN a request hits that route
THEN no process warning is emitted
AND the response body is { hello: 'world' }
```


## VAL-09: No warning when handler returns reply object


```javascript
GIVEN a route with an async handler that calls reply.code(200).send(data) and returns reply
WHEN a request hits that route
THEN no process warning is emitted
```


## VAL-10: No regressions in existing test suite


```javascript
GIVEN all changes are applied
WHEN I run npm run unit
THEN all tests pass
AND when I run npm run test:typescript
THEN type checking passes
```


---

# Technical Context
# Technical Context: Actionable Error Message Improvements

## Verified Tech Stack

From `package.json` (top-level fields and `dependencies`/`devDependencies` sections):

- **Language**: Node.js (CommonJS — `"type": "commonjs"`)
- **Framework**: Fastify 5.7.4 (`"version": "5.7.4"`, `"main": "fastify.js"`)
- **Package Manager**: npm (`package.json` present, no lock-file override)
- **Error creation**: `@fastify/error` ^4.0.0 — all `FST_ERR_*` codes use `createError` from this package
- **Warning creation**: `process-warning` ^5.0.0 — all `FSTWRN*`/`FSTDEP*` codes use `createWarning` from this package
- **Test runner**: `borp` ^1.0.0 wrapping Node.js native `node:test`; test files matched by `.borp.yaml` (`test/**/*.test.js`, `test/**/*.test.mjs`)
- **TypeScript**: `typescript` ~5.9.2; type-check via `tsd` ^0.33.0; type definitions at `fastify.d.ts` and `types/`
- **Linter**: neostandard ^0.12.0 (ESLint config in `eslint.config.js`)

---

## Relevant Files & Patterns

### Files to modify

- **`lib/errors.js`** (the `codes` object) — defines all `FST_ERR_*` constructors via `createError`. This is where `FST_ERR_INSTANCE_ALREADY_LISTENING` and `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` templates live.
- **`lib/warnings.js`** — defines all `FSTWRN*`/`FSTDEP*` constructors via `createWarning`. The new route-handler warning must be added here.
- **`fastify.js`** (`addHook` function, `throwIfAlreadyStarted` helper) — application-level hook arity validation and the "already started" guard. All four `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` throws and all `throwIfAlreadyStarted` call sites are here.
- **`lib/route.js`** (inner loop over `lifecycleHooks`, lines ~297–318) — route-level hook arity validation; three `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` throws, with the hook name available as the loop variable `hook`.
- **`lib/wrap-thenable.js`** (`wrapThenable` function) — handles the promise from async route handlers; this is where the no-response warning check must be inserted.
- **`types/errors.d.ts`** (`FastifyErrorCodes` union type) — if `FST_ERR_HOOK_INVALID_ASYNC_HANDLER`'s constructor signature changes materially, verify the union type still satisfies `FastifyErrorConstructor`; a new entry is only required if a new `FST_ERR_*` code is introduced (the warning does not live here).

### Test files to update

- **`test/internals/errors.test.js`** — has a unit test for `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` at line 293 that asserts the exact message string. Must be updated. Also asserts a count of `86` errors at line 8 — update if new `FST_ERR_*` codes are added.
- **`test/hooks-async.test.js`** — multiple tests assert the exact `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` message string (lines 770, 783, 796, 804, 812, 977, 1001, 1025, 1049, 1073, 1097). All must be updated to match the new message format including the hook name.
- **`test/hooks.on-ready.test.js`** — line 329 asserts the exact `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` message. Must be updated.
- **`test/route.1.test.js`** — line 233 asserts `new FST_ERR_INSTANCE_ALREADY_LISTENING('Cannot add route!')`. Must be updated to match the new error message format.
- **`test/internals/reply.test.js`** — line 1597 asserts `e.code === 'FST_ERR_INSTANCE_ALREADY_LISTENING'`. Code check will still pass; verify the message assertion if present.
- **`test/wrap-thenable.test.js`** — add new test scenarios for the no-response warning.

### Existing patterns to follow

- **Error definition** (`lib/errors.js`, `codes` object): `createError(CODE_STRING, messageTemplate, httpStatusCode, ErrorClass?)`. Message templates use `%s` for positional string interpolation. Example: `FST_ERR_HOOK_INVALID_HANDLER` uses `'%s hook should be a function, instead got %s'`.
- **Warning definition** (`lib/warnings.js`): `createWarning({ name, code, message, unlimited })`. Next available code is **`FSTWRN005`** (FSTWRN001, FSTWRN003, FSTWRN004 are active in v5; FSTWRN002 was reserved by v4 and must not be reused — per comment in `lib/warnings.js`).
- **Warning invocation** (`lib/route.js` line 624, `lib/server.js` line 37): The return value of `createWarning(...)` is a callable function; invoke it directly with interpolation args — e.g., `FSTWRN003('listen method')`.
- **Warning deduplication**: `createWarning` without `unlimited: true` deduplicates by code (emits once total across the process lifetime). To achieve per-route deduplication (fire once per distinct route pattern), use `unlimited: true` on the new warning and maintain a module-level `Set` of seen route keys inside `lib/wrap-thenable.js`.
- **`throwIfAlreadyStarted` pattern** (`fastify.js` lines 459–461, 569, 617, 693–795): The helper signature is `throwIfAlreadyStarted(msg)` and it calls `throw new FST_ERR_INSTANCE_ALREADY_LISTENING(msg)`. Currently `msg` is the full sentence (e.g., `'Cannot call "addHook"!'`); for IMP-1 the template changes to embed a `%s` for the operation name only, which requires updating both the template and the argument passed at each call site to be just the operation name string.
- **Test assertion style** (`test/internals/errors.test.js`): Unit tests for error constructors use `t.plan(5)` and assert `.name`, `.code`, `.message`, `.statusCode`, and `instanceof`. See lines 293–301 for the `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` test as the direct model to update.

---

## Integration Points

- **`lib/errors.js` → `fastify.js`**: `FST_ERR_INSTANCE_ALREADY_LISTENING` is imported in `fastify.js` (line 70) and thrown by `throwIfAlreadyStarted`. Changing the message template in `lib/errors.js` requires updating the argument passed at every `throwIfAlreadyStarted(...)` call site in `fastify.js` (lines 569, 617, 693, 700, 706, 713, 719, 732, 740, 758, 792) and in `lib/route.js` (line 204, `'Cannot add route!'`).
- **`lib/errors.js` → `fastify.js` + `lib/route.js`**: `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` is imported in both files. Adding a `%s` parameter to the template requires all `throw new FST_ERR_HOOK_INVALID_ASYNC_HANDLER()` call sites (4 in `fastify.js`, 3 in `lib/route.js`) to pass the hook name.
- **`lib/warnings.js` → `lib/wrap-thenable.js`**: The new warning must be exported from `lib/warnings.js` and required in `lib/wrap-thenable.js`. `wrapThenable` already receives `reply` which exposes `reply.request.routeOptions.method` and `reply.request.routeOptions.url` for the route identifier.
- **`types/errors.d.ts`**: The `FastifyErrorCodes` union uses `Record<..., FastifyErrorConstructor>` — warnings are not listed here. No new entry is needed unless a new `FST_ERR_*` code is introduced (IMP-3 adds only a warning).
- **`test/types/errors.test-d.ts`**: Mirrors the union in `types/errors.d.ts`. Update alongside `types/errors.d.ts` if the union changes.

**Impact boundary**: All changes are in error/warning paths and test files. No changes to HTTP routing, serialization, plugin lifecycle, or public API surface. The `docs/` directory is out of scope.

---

## Data Persistence

### Error message template changes

**`lib/errors.js` — `FST_ERR_INSTANCE_ALREADY_LISTENING` (current vs. required):**

```javascript
// Current (lib/errors.js, FST_ERR_INSTANCE_ALREADY_LISTENING):
FST_ERR_INSTANCE_ALREADY_LISTENING: createError(
  'FST_ERR_INSTANCE_ALREADY_LISTENING',
  'Fastify instance is already listening. %s'  // %s = full sentence like 'Cannot call "addHook"!'
)

// Required:
FST_ERR_INSTANCE_ALREADY_LISTENING: createError(
  'FST_ERR_INSTANCE_ALREADY_LISTENING',
  'Cannot call "%s" when fastify instance is already started! Move this call inside a plugin register function so it executes before the server starts.'
  // %s = operation name only, e.g. 'addHook'
)
```

Call sites must also change — from `throwIfAlreadyStarted('Cannot call "addHook"!')` to `throwIfAlreadyStarted('addHook')`, and from `throwIfAlreadyStarted('Cannot add route!')` to `throwIfAlreadyStarted('route')` (or appropriate method name).

**`lib/errors.js` — `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` (current vs. required):**

```javascript
// Current:
FST_ERR_HOOK_INVALID_ASYNC_HANDLER: createError(
  'FST_ERR_HOOK_INVALID_ASYNC_HANDLER',
  "Async function has too many arguments. Async hooks should not use the 'done' argument.",
  500,
  TypeError
)

// Required:
FST_ERR_HOOK_INVALID_ASYNC_HANDLER: createError(
  'FST_ERR_HOOK_INVALID_ASYNC_HANDLER',
  "Async function for \"%s\" hook has too many arguments. Async hooks should not use the 'done' argument.",
  500,
  TypeError
)
```

### New warning definition

**`lib/warnings.js` — new `FSTWRN005`:**

```javascript
const FSTWRN005 = createWarning({
  name: 'FastifyWarning',
  code: 'FSTWRN005',
  message: 'Route handler for "%s %s" resolved without sending a response. Return a value from the handler or call reply.send() explicitly.',
  unlimited: true  // needed so the per-route Set can control single-fire-per-route
})
```

Export it alongside `FSTWRN001`, `FSTWRN003`, `FSTWRN004`, `FSTSEC001`, `FSTDEP022`.

### Warning check in `lib/wrap-thenable.js`

The check belongs inside the `thenable.then(function (payload) { ... })` callback, after the `reply[kReplyHijacked]` guard, before the existing `payload !== undefined` branch:

```javascript
// Require at top of file:
const { FSTWRN005 } = require('./warnings')
const noResponseWarnedRoutes = new Set()

// Inside thenable.then, after the kReplyHijacked guard:
if (
  payload === undefined &&
  reply.sent === false
) {
  const method = reply.request.routeOptions.method
  const url = reply.request.routeOptions.url
  const routeKey = `${method} ${url}`
  if (!noResponseWarnedRoutes.has(routeKey)) {
    noResponseWarnedRoutes.add(routeKey)
    FSTWRN005(method, url)
  }
}
```

Note: `reply.sent` is `false` when no response has been dispatched yet. `reply.request.routeOptions` exposes `method` and `url` from `context.config` (see `lib/request.js` `routeOptions` getter).

---

## Technical Constraints

- **Error codes are immutable**: `FST_ERR_INSTANCE_ALREADY_LISTENING` and `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` codes must remain exactly as-is. Only the message template string changes.
- **Warning code sequencing**: FSTWRN002 was reserved by v4 and must not be reused (per comment at `lib/warnings.js` line 13). `FSTWRN005` is the correct next code.
- **`expectedErrors` count**: `test/internals/errors.test.js` line 8 hardcodes `const expectedErrors = 86`. This count must remain `86` since no new `FST_ERR_*` codes are being added (only the message templates of existing codes change, and the new addition is a warning, not an error).
- **Test runner constraint**: Tests must use `node:test` (via `borp`). No Jest, Mocha, or other runners may be introduced.
- **No new dependencies**: All new code must use `@fastify/error` (errors) and `process-warning` (warnings), which are already production dependencies.

---

## Testing Strategy

Test files follow `require('node:test')` with `t.assert.*` assertions (Node.js native assert style, not `assert.*` directly). See `test/internals/errors.test.js` for the canonical error unit-test pattern, `test/hooks-async.test.js` for integration-style hook error tests, and `test/wrap-thenable.test.js` for wrap-thenable unit tests.

**Test scenario template (from `test/internals/errors.test.js` lines 293–301):**

```javascript
test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER', t => {
  t.plan(5)
  const error = new errors.FST_ERR_HOOK_INVALID_ASYNC_HANDLER('onRequest')
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
  t.assert.strictEqual(error.message, "Async function for \"onRequest\" hook has too many arguments. Async hooks should not use the 'done' argument.")
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})
```

### Scenarios

**IMP-1 — Already started error message:**

1. **Unit: error template** — Instantiate `new errors.FST_ERR_INSTANCE_ALREADY_LISTENING('addHook')`, assert `.code === 'FST_ERR_INSTANCE_ALREADY_LISTENING'`, `.message` contains `'addHook'` and `'inside a plugin register function'`.

2. **Integration: addHook after start** — Start a Fastify instance, call `fastify.addHook('onRequest', handler)`, assert error code is `FST_ERR_INSTANCE_ALREADY_LISTENING` and message contains `'addHook'` and guidance text.

3. **Integration: route shorthand after start** — Start a Fastify instance, call `fastify.get('/test', handler)`, assert same error code, message contains guidance text (VAL-02).

4. **Integration: register after start** — Start a Fastify instance, call `fastify.register(plugin)`, assert error code and guidance text present in message.

**IMP-2 — Hook name in async arity error:**

5. **Unit: error template with hook name** — Instantiate `new errors.FST_ERR_HOOK_INVALID_ASYNC_HANDLER('onRequest')`, assert `.code`, `.message` contains `'onRequest'`, `instanceof TypeError`. (Replaces existing test at `test/internals/errors.test.js` line 293.)

6. **Application hook — onRequest (3 args)** — `fastify.addHook('onRequest', async (req, reply, done) => {})`, assert code is `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` and message contains `'onRequest'` (VAL-03).

7. **Application hook — onSend (4 args)** — `fastify.addHook('onSend', async (req, reply, payload, done) => {})`, assert message contains `'onSend'` (VAL-05).

8. **Route-level hook — preHandler** — Register a route with `{ preHandler: [async (req, reply, done) => {}] }`, call `fastify.ready()`, assert error contains `'preHandler'` (VAL-04). Test `preSerialization` as the third hook type to meet "at least 3 different hook types" criteria.

**IMP-3 — No-response warning:**

9. **Warning fires for undefined return** — Register a route whose async handler returns `undefined` without calling `reply.send()`, inject a request, assert a `process.on('warning', ...)` listener receives a warning with code `FSTWRN005` whose message contains the HTTP method and route URL (VAL-06).

10. **No warning for value return** — Async handler returns `{ hello: 'world' }`, inject a request, assert no `FSTWRN005` warning is emitted and response body is `{ hello: 'world' }` (VAL-07).

11. **No warning for explicit reply.send()** — Async handler calls `reply.send({...})` and returns `undefined`, inject a request, assert no warning (VAL-08).

12. **No warning for return reply** — Async handler calls `reply.code(200).send(data)` and returns `reply`, inject a request, assert no warning (VAL-09).

13. **Deduplication: warning fires only once per route** — Register a route with the buggy handler, inject two requests, assert the warning listener is called exactly once for that route pattern.
