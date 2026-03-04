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

