# Product Requirements Document (PRD)
**Repository**: `https://github.com/dbenedetti-trimble/ada-nodejs-test-fastify`

---


# Context & Problem


## Problem statement

- **Who is affected?** Developers building Fastify APIs with routes that have different latency profiles (e.g., a fast health check vs. a slow report generation endpoint) who need per-route timeout control.
- **What is the issue?** Fastify exposes a server-level `requestTimeout` option (which maps directly to Node.js `server.requestTimeout`), but there is no way to set timeouts per route. A global 30-second timeout is too long for a health check and too short for a data export. Additionally, there is no `AbortSignal` available on `request` that handlers can use to cooperatively cancel in-flight work (database queries, HTTP calls, stream processing) when a timeout fires or the client disconnects.
- **Why does it matter?** Per-route timeouts are essential for production APIs. Without them, developers either set a conservative global timeout (hurting long-running routes), set no timeout (risking resource exhaustion from hung requests), or implement their own timer logic per handler (error-prone, inconsistent, no standard cleanup). Providing `request.signal` as an `AbortSignal` follows the web platform pattern and integrates cleanly with `fetch()`, database drivers, and any `AbortSignal`-aware API.

## Success metrics


|                         Metric                         |              Baseline               |                              Target                               |     Validation method     |
| ------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| Per-route `requestTimeout` option works                | No per-route timeout                | Routes with `requestTimeout` auto-respond 408 after configured ms | Unit tests                |
| `request.signal` aborts on timeout                     | No `request.signal`                 | `request.signal.aborted` is `true` after timeout fires            | Unit tests                |
| `request.signal` aborts on client disconnect           | No `request.signal`                 | `request.signal.aborted` is `true` when client closes connection  | Unit tests                |
| Existing `onTimeout` hook fires for per-route timeouts | Only fires for socket-level timeout | Also fires when per-route `requestTimeout` expires                | Unit tests                |
| Timer cleanup on normal completion                     | N/A                                 | No leaked timers when request completes before timeout            | Unit tests                |
| No behavior change when `requestTimeout` is not set    | Current behavior                    | Identical behavior for routes without `requestTimeout`            | `npm run unit`            |
| All existing tests pass                                | 100% pass                           | 100% pass (no regressions)                                        | `npm run unit`            |
| TypeScript types updated                               | N/A                                 | `requestTimeout` in route options, `signal` on request            | `npm run test:typescript` |


# Scope & Constraints


## In scope

- New `requestTimeout` route option (milliseconds) on route definitions
- Global default `routeTimeout` at Fastify instance level (distinct from Node.js `server.requestTimeout`)
- `request.signal` property returning an `AbortSignal` that aborts on timeout or client disconnect
- Automatic `408 Request Timeout` response when per-route timeout fires (if response not already started)
- Timer cleanup when request completes normally (no leaked `setTimeout` handles)
- Firing the existing `onTimeout` hook when per-route timeout triggers
- Updating TypeScript type definitions in `types/`
- Comprehensive test suite using `node:test` via `borp`

## Out of scope

- Changing the existing server-level `requestTimeout` behavior
- Changing behavior of the existing `onTimeout` hook for socket-level timeouts
- Request body upload timeouts
- Timeout for specific lifecycle hooks
- Retry or circuit breaker behavior
- Changes to Fastify's existing `connectionTimeout` or `keepAliveTimeout` options
- Documentation site changes (docs/ directory)

## Dependencies & Risks

- **Backwards compatibility**: Adding a new route option is backwards-compatible. When `requestTimeout` is not set, no timer is created and no behavior changes.
- **Timer accuracy**: `setTimeout` in Node.js is not precise. Tests need tolerance margins (200ms+ timeouts to avoid flakiness).
- **Streaming responses**: If the handler has already started streaming when timeout fires, abort the signal and log a warning but do not send 408.
- **Hook interaction**: The `onTimeout` hook already fires for socket-level timeouts. Per-route timeout also fires it. Per-route fires first (more granular).
- **Test runner**: Tests must use `node:test` (via `borp`).
- **AbortController**: Built-in global in Node.js 16+. Fastify v5 requires Node.js 20+.

# Functional Requirements


## TIMEOUT-1: Per-route requestTimeout option


**Required behavior:**


Routes accept a `requestTimeout` option (in milliseconds):


```javascript
fastify.get('/health', { requestTimeout: 2000 }, async (request, reply) => {
  return { status: 'ok' }
})

fastify.get('/reports/generate', { requestTimeout: 120000 }, async (request, reply) => {
  const report = await generateLargeReport()
  return report
})
```


When set: timer starts when the route handler begins execution (after `onRequest`/`preParsing` hooks). If the timer fires before response is sent, a 408 is sent. If response completes first, timer is cleared.


**Acceptance criteria:**

- Routes with `requestTimeout: N` start a timer after routing completes
- Timer cleared when response finishes
- Routes without `requestTimeout` have no timer
- Invalid values (non-integer, negative) throw `FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT`
- `requestTimeout: 0` disables timeout for that route

## TIMEOUT-2: Global default routeTimeout


**Required behavior:**


Global default via `routeTimeout` (distinct from Node.js `server.requestTimeout`):


```javascript
const fastify = require('fastify')({ routeTimeout: 30000 })
fastify.get('/api/users', async () => { ... })       // uses 30s default
fastify.get('/health', { requestTimeout: 5000 }, ...) // overrides to 5s
fastify.get('/reports', { requestTimeout: 0 }, ...)   // disables timeout
```


**Acceptance criteria:**

- `routeTimeout` on constructor sets default for all routes
- Per-route `requestTimeout` overrides `routeTimeout`
- `requestTimeout: 0` disables even when `routeTimeout` is set
- No timer when neither is set
- Exposed via `fastify.initialConfig.routeTimeout`
- Must be non-negative integer

## TIMEOUT-3: Automatic 408 response on timeout


**Required behavior:**


When timeout fires:

1. If `reply.sent` is false: send 408 with standard JSON error body (`{"statusCode":408,"error":"Request Timeout","message":"Request Timeout"}`)
2. If `reply.sent` is true (streaming): log warning, do not send 408

Sent via `reply.send()` with Fastify error object so `onError` hooks and custom error handlers can intercept.


**Acceptance criteria:**

- Timeout with no response started returns HTTP 408
- Timeout after `reply.raw.write()` logs warning, no 408
- Timeout after `reply.send()` is a no-op
- Custom `errorHandler` can override the 408
- New error code `FST_ERR_ROUTE_REQUEST_TIMEOUT` in `lib/errors.js`

## TIMEOUT-4: request.signal (AbortSignal)


**Required behavior:**


Every request gets `request.signal` (an `AbortSignal`). Aborts when:

- Per-route timeout fires
- Client disconnects

```javascript
fastify.get('/data', { requestTimeout: 5000 }, async (request, reply) => {
  const data = await fetch('https://api.example.com/slow', { signal: request.signal })
  return data.json()
})
```


Implementation: `AbortController` created per request. On timeout: `controller.abort(new FST_ERR_ROUTE_REQUEST_TIMEOUT())`. On client disconnect: `controller.abort()`.


**Acceptance criteria:**

- `request.signal` is an `AbortSignal` instance
- `request.signal.aborted` is false before timeout/disconnect
- `request.signal.aborted` is true after timeout fires
- `request.signal.aborted` is true after client disconnects
- `request.signal.reason` is `FST_ERR_ROUTE_REQUEST_TIMEOUT` when aborted by timeout
- Works with `fetch()`, `events.on()`, and other AbortSignal-aware APIs
- For routes without timeout and no disconnect, signal never aborts

## TIMEOUT-5: onTimeout hook integration


**Required behavior:**


Existing `onTimeout` hook fires on per-route timeout (in addition to socket-level):


```javascript
fastify.addHook('onTimeout', async (request, reply) => {
  request.log.warn({ url: request.url, timeout: request.routeOptions.requestTimeout }, 'request timed out')
})
```


Route-level hooks also work. Hook fires before 408 is sent.


**Acceptance criteria:**

- App-level and route-level `onTimeout` hooks fire on per-route timeout
- Hook receives request and reply objects
- Hook fires before 408 error is sent
- Hook does NOT fire for normal requests completing before timeout
- Existing socket-level `onTimeout` behavior unchanged

## TIMEOUT-6: Timer cleanup


When request completes before timeout, timer must be cleared.


**Acceptance criteria:**

- Timer cleared on successful `reply.send()`
- Timer cleared on error (error handler sends response)
- Timer cleared on client disconnect
- No leaked `setTimeout` handles after request completion

## TIMEOUT-7: requestTimeout in request.routeOptions


`request.routeOptions.requestTimeout` returns the effective timeout (route-level or global default). Returns `undefined` if no timeout configured.


**Acceptance criteria:**

- Returns route's timeout in ms
- Returns route-level value when set, otherwise global `routeTimeout`
- Returns `undefined` when no timeout configured
- Returns `0` when explicitly disabled

# Technical Solution


## Architecture & Components


**Modified files:**


|                   File                   |                                                                      Change                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/errors.js`                          | Add `FST_ERR_ROUTE_REQUEST_TIMEOUT` (408) and `FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT` (validation)                                        |
| `lib/context.js`                         | Add `requestTimeout` property to Context constructor                                                                                             |
| `lib/route.js`                           | Read `requestTimeout` from route options, validate, pass to Context. Start timer in `routeHandler`, clear on response. Wire up abort on timeout. |
| `lib/request.js`                         | Add `signal` getter returning `AbortSignal`. Add `requestTimeout` to `routeOptions` getter.                                                      |
| `lib/reply.js`                           | Clear timeout timer when response is sent                                                                                                        |
| `lib/symbols.js`                         | Add `kRequestAbortController` and `kRequestTimeout` symbols                                                                                      |
| `fastify.js`                             | Accept `routeTimeout` option, validate, store. Pass through to route setup.                                                                      |
| `lib/config-validator.js`                | Add `routeTimeout` to config schema                                                                                                              |
| `types/route.d.ts`                       | Add `requestTimeout` to `RouteShorthandOptions`                                                                                                  |
| `types/request.d.ts`                     | Add `signal: AbortSignal` to `FastifyRequest`, `requestTimeout` to `RequestRouteOptions`                                                         |
| `types/instance.d.ts`                    | Add `routeTimeout` to `FastifyServerOptions`                                                                                                     |
| `types/errors.d.ts`                      | Add `FST_ERR_ROUTE_REQUEST_TIMEOUT`                                                                                                              |
| `test/per-route-request-timeout.test.js` | New test file                                                                                                                                    |
| `test/types/request.test-d.ts`           | Type test for `request.signal`                                                                                                                   |
| `test/types/route.test-d.ts`             | Type test for `requestTimeout` option                                                                                                            |


## Implementation notes


**Option flow** follows the `bodyLimit` pattern: `routeTimeout` stored on instance -> per-route `requestTimeout` passed to `Context` -> `context.requestTimeout = requestTimeout || server[kRouteTimeout] || 0` -> exposed via `request.routeOptions`.


**Timer lifecycle** in `routeHandler`: create `AbortController` on request, start `setTimeout` if timeout > 0, store handle on reply for cleanup. On fire: abort signal, run `onTimeoutHookRunner`, send error if `reply.sent` is false. On client disconnect: abort signal.


**Timer cleanup** in reply send path: `clearTimeout(this[kRequestTimeout])` when response completes.


**Error codes:**


```javascript
const FST_ERR_ROUTE_REQUEST_TIMEOUT = createError('FST_ERR_ROUTE_REQUEST_TIMEOUT', 'Request Timeout', 408)
const FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT = createError('FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', "'requestTimeout' option must be a non-negative integer. Got '%s'", 500, TypeError)
```


## Dependency changes


None. `AbortController` is a built-in global in Node.js 16+.


# Validation Contract


## VAL-01: Basic per-route timeout triggers 408


```javascript
GIVEN a route with requestTimeout: 200 AND handler awaits sleep(500)
WHEN I send a request THEN response status is 408 AND body contains "Request Timeout"
```


## VAL-02: Request completes before timeout


```javascript
GIVEN a route with requestTimeout: 5000 AND handler responds immediately
WHEN I send a request THEN response status is 200
```


## VAL-03: Route without requestTimeout has no timeout


```javascript
GIVEN a route with no requestTimeout AND no routeTimeout AND handler awaits sleep(300)
WHEN I send a request THEN response status is 200
```


## VAL-04: Global routeTimeout applies


```javascript
GIVEN Fastify with routeTimeout: 200 AND handler awaits sleep(500)
WHEN I send a request THEN response status is 408
```


## VAL-05: Per-route overrides global


```javascript
GIVEN Fastify with routeTimeout: 200 AND route with requestTimeout: 5000 AND handler awaits sleep(300)
WHEN I send a request THEN response status is 200
```


## VAL-06: requestTimeout: 0 disables timeout


```javascript
GIVEN Fastify with routeTimeout: 200 AND route with requestTimeout: 0 AND handler awaits sleep(300)
WHEN I send a request THEN response status is 200
```


## VAL-07: request.signal is an AbortSignal


```javascript
GIVEN a route with requestTimeout: 5000
WHEN handler accesses request.signal THEN it is an AbortSignal AND aborted is false
```


## VAL-08: request.signal aborts on timeout


```javascript
GIVEN a route with requestTimeout: 200 AND handler awaits sleep(500)
WHEN request times out THEN request.signal.aborted is true AND reason is FST_ERR_ROUTE_REQUEST_TIMEOUT
```


## VAL-09: request.signal aborts on client disconnect


```javascript
GIVEN a route AND handler awaits sleep(5000)
WHEN client aborts connection THEN request.signal.aborted is true
```


## VAL-10: onTimeout hook fires on per-route timeout


```javascript
GIVEN an onTimeout hook AND route with requestTimeout: 200 AND handler awaits sleep(500)
WHEN request times out THEN onTimeout hook fires with request and reply objects
```


## VAL-11: Route-level onTimeout hook fires


```javascript
GIVEN a route with requestTimeout: 200 and route-level onTimeout hook AND handler awaits sleep(500)
WHEN request times out THEN route-level onTimeout hook fires
```


## VAL-12: onTimeout hook does NOT fire on normal completion


```javascript
GIVEN a route with requestTimeout: 5000 and onTimeout hook AND handler responds immediately
WHEN I send a request THEN response is 200 AND onTimeout hook does NOT fire
```


## VAL-13: Custom errorHandler overrides 408


```javascript
GIVEN a route with requestTimeout: 200 and custom errorHandler returning 503
WHEN request times out THEN response status is 503 with custom body
```


## VAL-14: Streaming response - timeout logs but no 408


```javascript
GIVEN a route with requestTimeout: 200 AND handler calls reply.raw.write() then awaits sleep(500)
WHEN timeout fires THEN request.signal.aborted is true AND warning logged AND no 408 sent
```


## VAL-15: Timer cleanup on normal completion


```javascript
GIVEN a route with requestTimeout: 60000 AND handler responds immediately
WHEN request completes AND server closes THEN server closes cleanly (no pending timer)
```


## VAL-16: Invalid requestTimeout throws


```javascript
GIVEN Fastify instance
WHEN registering route with requestTimeout: -1 or 3.5 or "fast"
THEN error thrown with code FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT
```


## VAL-17: requestTimeout in routeOptions


```javascript
GIVEN a route with requestTimeout: 5000
WHEN handler reads request.routeOptions.requestTimeout THEN value is 5000
```


## VAL-18: Global default in routeOptions


```javascript
GIVEN Fastify with routeTimeout: 30000 AND route with no per-route requestTimeout
WHEN handler reads request.routeOptions.requestTimeout THEN value is 30000
```


## VAL-19: No regressions


```javascript
GIVEN all changes applied
WHEN npm run unit THEN all tests pass
AND npm run test:typescript THEN type checking passes
```


---

# Technical Context
# Technical Context: Per-Route Request Timeout & `request.signal`

---

## Verified Tech Stack

**From `package.json` (`name`/`version` and `engines` fields):**
- Runtime: Node.js 20+ (Fastify v5 requirement; `AbortController` is a built-in global — no new dependencies needed)
- Framework: Fastify 5.7.4 (`"version": "5.7.4"` in `package.json`)
- Package Manager: npm (`package.json` present, no `pnpm-lock.yaml` or `yarn.lock`)

**From `package.json` (`dependencies` section):**
- Error factory: `@fastify/error ^4.0.0` — used to create all `FST_ERR_*` codes via `createError()`
- Router: `find-my-way ^9.0.0`
- Injection/testing: `light-my-request ^6.0.0`

**From `package.json` (`devDependencies` section):**
- Test runner: `borp ^1.0.0` (wraps `node:test`)
- Type checker: `tsd ^0.33.0` + `typescript ~5.9.2`
- Fake timers: `@sinonjs/fake-timers ^11.2.2` (available for flakiness-sensitive timer tests)

---

## Relevant Files & Patterns

### Files to modify

| File | Why relevant |
|------|-------------|
| `lib/symbols.js` | Central registry of all `Symbol` keys; add `kRequestAbortController` and `kRequestTimeout` here |
| `lib/errors.js` | All `FST_ERR_*` codes defined here via `createError()`; add two new codes |
| `lib/context.js` | `Context` constructor holds per-route config; add `requestTimeout` property following `bodyLimit` pattern |
| `lib/route.js` | Contains `validateBodyLimitOption` (exact analogue to add); `routeHandler` is the request entry point |
| `lib/request.js` | `Request.prototype.routeOptions` getter; add `signal` getter and `requestTimeout` to `routeOptions` |
| `lib/reply.js` | Response send path; clear the per-route timer here |
| `fastify.js` | Top-level Fastify factory; stores `kBodyLimit` — follow same pattern for `kRouteTimeout` |
| `build/build-validation.js` | **Source of truth** for `lib/config-validator.js` (see critical note below) |
| `types/route.d.ts` | `RouteShorthandOptions` interface; add `requestTimeout?: number` |
| `types/request.d.ts` | `FastifyRequest` interface and `RequestRouteOptions` interface; add `signal` and `requestTimeout` |
| `types/instance.d.ts` | `initialConfig` Readonly block; add `routeTimeout?: number` |
| `types/errors.d.ts` | `FastifyErrorCodes` union; add two new error code string literals |

### New file to create

| File | Purpose |
|------|---------|
| `test/per-route-request-timeout.test.js` | All per-route timeout test cases (VAL-01 through VAL-19) |
| `test/types/request.test-d.ts` | Add type assertions for `request.signal` (edit existing file) |
| `test/types/route.test-d.ts` | Add type assertions for `requestTimeout` option (edit existing file) |

---

### Existing patterns to follow

#### `bodyLimit` → model for `routeTimeout`/`requestTimeout`

`bodyLimit` is the closest existing feature analogue. Follow every step of its flow:

**1. Symbol** — from `lib/symbols.js` (top-level `keys` object):
```javascript
kBodyLimit: Symbol('fastify.bodyLimit'),
// Add:
kRouteTimeout: Symbol('fastify.routeTimeout'),       // instance-level default
kRequestTimeout: Symbol('fastify.requestTimeout'),   // per-request timer handle
kRequestAbortController: Symbol('fastify.requestAbortController'),
```

**2. Fastify constructor** — from `fastify.js` (fastify instance object literal, `[kBodyLimit]` line):
```javascript
[kBodyLimit]: options.bodyLimit,
// Add:
[kRouteTimeout]: options.routeTimeout || 0,
```

**3. Validation** — from `lib/route.js` (`validateBodyLimitOption` function, near end of file):
```javascript
function validateBodyLimitOption (bodyLimit) {
  if (bodyLimit === undefined) return
  if (!Number.isInteger(bodyLimit) || bodyLimit <= 0) {
    throw new FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT(bodyLimit)
  }
}
// Add analogous:
function validateRequestTimeoutOption (requestTimeout) {
  if (requestTimeout === undefined) return
  if (!Number.isInteger(requestTimeout) || requestTimeout < 0) {
    throw new FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT(requestTimeout)
  }
}
```

Note: `requestTimeout: 0` is valid (disables timeout), so the check is `< 0` not `<= 0`.

**4. Context** — from `lib/context.js` (`Context` constructor, `_parserOptions.limit` line):
```javascript
this._parserOptions = { limit: bodyLimit || server[kBodyLimit] }
// Add:
this.requestTimeout = (requestTimeout !== undefined ? requestTimeout : server[kRouteTimeout])
```

**5. Context is populated in route** — from `lib/route.js` (`addNewRoute` → `this.after` callback, `context._parserOptions.limit` assignment):
```javascript
context._parserOptions.limit = opts.bodyLimit || null
// Add:
context.requestTimeout = opts.requestTimeout !== undefined
  ? opts.requestTimeout
  : server[kRouteTimeout] || 0
```

**6. `request.routeOptions`** — from `lib/request.js` (`routeOptions` getter in `Object.defineProperties`):
```javascript
const options = {
  method: context.config?.method,
  url: context.config?.url,
  bodyLimit: (routeLimit || serverLimit),
  // ... other fields ...
}
// Add to options:
requestTimeout: context.requestTimeout
```

#### Error code pattern — from `lib/errors.js` (route section, `FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT`):
```javascript
FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT: createError(
  'FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT',
  "'bodyLimit' option must be an integer > 0. Got '%s'",
  500,
  TypeError
),
// Add:
FST_ERR_ROUTE_REQUEST_TIMEOUT: createError(
  'FST_ERR_ROUTE_REQUEST_TIMEOUT',
  'Request Timeout',
  408
),
FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT: createError(
  'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT',
  "'requestTimeout' option must be a non-negative integer. Got '%s'",
  500,
  TypeError
),
```

#### `onTimeout` hook runner — from `lib/route.js` (existing `handleTimeout` function and `routeHandler` socket binding, lines ~548–570):

The existing socket-level `onTimeout` invocation shows how to call `onTimeoutHookRunner`. The per-route timer uses the same runner:
```javascript
// Existing pattern (socket-level):
function handleTimeout () {
  const { context, request, reply } = this._meta
  onTimeoutHookRunner(context.onTimeout, request, reply, noop)
}

// Per-route timer callback (new, inside routeHandler):
function onPerRouteTimeout () {
  controller.abort(new FST_ERR_ROUTE_REQUEST_TIMEOUT())
  if (context.onTimeout !== null) {
    onTimeoutHookRunner(context.onTimeout, request, reply, afterTimeoutHooks)
  } else {
    afterTimeoutHooks(null, request, reply)
  }
}
function afterTimeoutHooks (err, request, reply) {
  if (err) reply.log.error({ err }, 'onTimeout hook error')
  if (!reply.sent) {
    reply.send(new FST_ERR_ROUTE_REQUEST_TIMEOUT())
  } else {
    reply.log.warn({ url: request.url }, 'response already sent, skipping 408')
  }
}
```

#### `request.signal` getter — follow `Object.defineProperties` pattern from `lib/request.js`:
```javascript
// Existing pattern:
url: { get () { return this.raw.url } },
// Add:
signal: {
  get () { return this[kRequestAbortController]?.signal }
}
```

#### Timer cleanup in reply — from `lib/reply.js` (look for where `onSend` / `send` path finalizes the response). Add `clearTimeout` at the point the response is committed:
```javascript
clearTimeout(this[kRequestTimeout])
this[kRequestTimeout] = undefined
```

#### Client disconnect → abort signal — from `lib/route.js` (`routeHandler`, `onRequestAbort` hook wiring near line ~535):
```javascript
// Existing abort pattern:
if (context.onRequestAbort !== null) {
  req.on('close', () => {
    if (req.aborted) { ... }
  })
}
// Add alongside AbortController:
req.on('close', () => {
  if (!reply.sent) {
    controller.abort()
  }
})
```

---

### ⚠️ Critical: `lib/config-validator.js` is autogenerated

`lib/config-validator.js` has the header comment:
```
// This file is autogenerated by build/build-validation.js, do not edit
```

The `npm run test:validator:integrity` script diffs the committed file against freshly generated output. **Do NOT edit `lib/config-validator.js` directly.** Instead:

1. Add `routeTimeout` to `defaultInitOptions` in `build/build-validation.js`:
   ```javascript
   routeTimeout: 0,  // no per-route timeout by default
   ```
2. Add to the `schema.properties` object in `build/build-validation.js`:
   ```javascript
   routeTimeout: { type: 'integer', default: defaultInitOptions.routeTimeout },
   ```
3. Run `npm run build:validation` to regenerate `lib/config-validator.js`
4. Commit the generated file alongside the build source change

---

## Integration Points

**Systems/modules affected by this change:**

- **`lib/route.js` (`routeHandler`)**: Core request entry point where the `AbortController` is created, the `setTimeout` is started, and cleanup is wired. This is the primary implementation site.

- **`lib/context.js` (`Context`)**: Holds per-route configuration shared across all requests on a route. `requestTimeout` is stored here, analogous to `_parserOptions.limit`.

- **`lib/request.js` (`Request.prototype`)**: Exposes `signal` (new getter) and `requestTimeout` (via `routeOptions` getter). Both read from the per-request `AbortController` and `Context`, respectively.

- **`lib/reply.js` (send path)**: Must `clearTimeout` the per-route timer when a response is committed to prevent leaked handles.

- **`lib/hooks.js` (`onTimeoutHookRunner`)**: Already exported and used for socket-level timeouts. Per-route timeout reuses the same runner.

- **`fastify.js` (constructor)**: Reads and stores `routeTimeout` option from `serverOptions` under a new symbol, analogous to `kBodyLimit`.

- **`build/build-validation.js` → `lib/config-validator.js`**: Config AJV schema must accept `routeTimeout` as a non-negative integer; must go through the build script.

- **TypeScript definitions** (`types/route.d.ts`, `types/request.d.ts`, `types/instance.d.ts`, `types/errors.d.ts`): All public API additions require corresponding type changes; validated by `npm run test:typescript` via `tsd`.

**Impact boundary:** All changes are internal to the Fastify core. No changes to the public HTTP surface (existing routes, endpoints, or wire protocol). External API contract is additive only — new options and properties, no removals or signature changes.

---

## Technical Constraints

- **`lib/config-validator.js` must not be edited directly** — it is autogenerated; edit `build/build-validation.js` and run `npm run build:validation`
- **`AbortController`** is a built-in Node.js global (Node 16+; Fastify v5 requires Node 20+) — no new runtime dependencies
- **Timer accuracy**: `setTimeout` in Node.js has ~1ms granularity but is non-deterministic under load. Tests that rely on timing must use timeouts ≥200ms and allow realistic tolerance margins
- **Streaming guard**: When `reply.raw.write()` has been called (streaming already started), `reply.sent` is `true` — the timeout handler must check this and skip sending 408, logging a warning instead
- **`routeTimeout: 0`** on the instance must not activate any timer (zero = disabled); `requestTimeout: 0` on a route overrides even a non-zero `routeTimeout` (explicit disable)
- **Timer handle storage**: Store the `setTimeout` return value and the `AbortController` on the reply (or request) via private symbols, not on the context (context is shared across requests; the timer is per-request)
- **`test:validator:integrity`** check in CI diffs `lib/config-validator.js` against the output of `npm run build:validation` — it will fail if the generated file doesn't match the committed file

---

## Data Persistence

No database changes. The following **data structures** change:

### `Context` object (from `lib/context.js`)
Add one new property:
```javascript
this.requestTimeout = 0  // resolved effective timeout in ms; 0 = disabled
```

### `Request` prototype (from `lib/request.js`)
Add one new getter:
```javascript
signal  // returns AbortSignal from the per-request AbortController
```

Extend `routeOptions` getter to include:
```javascript
requestTimeout: context.requestTimeout  // effective timeout; undefined when 0 and no global default
```

### Per-request state (new symbols on `Reply` or `Request`)
Two new symbol-keyed properties set in `routeHandler`:
```javascript
reply[kRequestTimeout]        // setTimeout handle (for clearTimeout)
reply[kRequestAbortController] // AbortController instance
```

### `initialConfig` (from `fastify.js` → `lib/initial-config-validation.js`)
The frozen `initialConfig` object gains:
```javascript
routeTimeout: number  // 0 by default
```

---

## Testing Strategy

**Complexity assessment**: Large feature (7 requirements, 19 validation criteria, timer lifecycle, hook integration). Target: 10–15 scenarios.

**Test file**: `test/per-route-request-timeout.test.js`

**From `test/body-limit.test.js` and `test/client-timeout.test.js`** (observed patterns): tests use `node:test` with `t.assert.strictEqual`/`t.assert.ok`, `t.plan()`, `t.after()` for server cleanup, and either `fastify.inject()` or real HTTP via `fetch` / `node:net`.

```javascript
'use strict'

const { test } = require('node:test')
const Fastify = require('..')

// Helper: sleep N ms
function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
```

### Scenario 1 — Per-route timeout triggers 408
```javascript
test('per-route requestTimeout: 200 fires 408 when handler is slow', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/slow', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/slow`)
  t.assert.strictEqual(res.status, 408)
  const body = await res.json()
  t.assert.strictEqual(body.statusCode, 408)
})
```

### Scenario 2 — Response completes before timeout → 200
```javascript
test('per-route requestTimeout: 5000 does not fire when handler is fast', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/fast', { requestTimeout: 5000 }, async () => ({ ok: true }))
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/fast`)
  t.assert.strictEqual(res.status, 200)
})
```

### Scenario 3 — Global routeTimeout applies to routes without per-route override
```javascript
test('global routeTimeout applies when no per-route requestTimeout', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/api', async () => { await sleep(500); return {} })
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/api`)
  t.assert.strictEqual(res.status, 408)
})
```

### Scenario 4 — Per-route requestTimeout overrides global routeTimeout
```javascript
test('per-route requestTimeout: 5000 overrides global routeTimeout: 200', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/long', { requestTimeout: 5000 }, async () => { await sleep(300); return {} })
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/long`)
  t.assert.strictEqual(res.status, 200)
})
```

### Scenario 5 — `requestTimeout: 0` disables timeout even when global routeTimeout is set
```javascript
test('requestTimeout: 0 disables timeout when global routeTimeout: 200 is set', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/exempt', { requestTimeout: 0 }, async () => { await sleep(300); return {} })
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/exempt`)
  t.assert.strictEqual(res.status, 200)
})
```

### Scenario 6 — `request.signal` is an AbortSignal, initially not aborted
```javascript
test('request.signal is an AbortSignal and is not aborted initially', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/check', { requestTimeout: 5000 }, async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return {}
  })
  await fastify.inject({ method: 'GET', url: '/check' })
})
```

### Scenario 7 — `request.signal` aborts on timeout with correct reason
```javascript
test('request.signal aborts with FST_ERR_ROUTE_REQUEST_TIMEOUT reason on timeout', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let capturedSignal
  fastify.get('/signal-check', { requestTimeout: 200 }, async (request) => {
    capturedSignal = request.signal
    await sleep(500)
    return {}
  })

  await fastify.listen({ port: 0 })
  await fetch(`http://localhost:${fastify.server.address().port}/signal-check`).catch(() => {})
  t.assert.strictEqual(capturedSignal.aborted, true)
  t.assert.strictEqual(capturedSignal.reason?.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})
```

### Scenario 8 — `onTimeout` hook fires on per-route timeout
```javascript
test('onTimeout hook fires when per-route requestTimeout fires', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let hookFired = false
  fastify.addHook('onTimeout', async (request, reply) => {
    hookFired = true
    t.assert.ok(request)
    t.assert.ok(reply)
  })
  fastify.get('/hook-test', { requestTimeout: 200 }, async () => { await sleep(500); return {} })

  await fastify.listen({ port: 0 })
  await fetch(`http://localhost:${fastify.server.address().port}/hook-test`).catch(() => {})
  t.assert.ok(hookFired)
})
```

### Scenario 9 — `onTimeout` hook does NOT fire on normal completion
```javascript
test('onTimeout hook does not fire when request completes before timeout', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let hookFired = false
  fastify.addHook('onTimeout', async () => { hookFired = true })
  fastify.get('/ok', { requestTimeout: 5000 }, async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/ok' })
  t.assert.strictEqual(hookFired, false)
})
```

### Scenario 10 — Custom `errorHandler` overrides 408
```javascript
test('custom errorHandler can override the 408 response', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/custom-err', {
    requestTimeout: 200,
    errorHandler (err, request, reply) {
      reply.status(503).send({ custom: true })
    }
  }, async () => { await sleep(500); return {} })

  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/custom-err`)
  t.assert.strictEqual(res.status, 503)
})
```

### Scenario 11 — Invalid `requestTimeout` values throw correct error
```javascript
test('invalid requestTimeout values throw FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', t => {
  t.plan(3)
  const fastify = Fastify()

  for (const bad of [-1, 3.5, 'fast']) {
    try {
      fastify.get('/bad', { requestTimeout: bad }, async () => ({}))
      t.assert.fail('should have thrown')
    } catch (err) {
      t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
    }
  }
})
```

### Scenario 12 — `request.routeOptions.requestTimeout` reflects effective value
```javascript
test('request.routeOptions.requestTimeout returns effective timeout', async t => {
  t.plan(2)
  const fastify = Fastify({ routeTimeout: 30000 })
  t.after(() => fastify.close())

  fastify.get('/with-override', { requestTimeout: 5000 }, async (req) => {
    t.assert.strictEqual(req.routeOptions.requestTimeout, 5000)
    return {}
  })
  fastify.get('/uses-global', async (req) => {
    t.assert.strictEqual(req.routeOptions.requestTimeout, 30000)
    return {}
  })

  await fastify.inject({ method: 'GET', url: '/with-override' })
  await fastify.inject({ method: 'GET', url: '/uses-global' })
})
```

### Scenario 13 — Timer cleanup: no pending handles after normal completion
```javascript
test('no leaked timer handle when request completes before timeout', async t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/no-leak', { requestTimeout: 60000 }, async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/no-leak' })

  await new Promise((resolve, reject) => fastify.close(err => err ? reject(err) : resolve()))
  t.assert.ok(true, 'server closed cleanly — no pending timer')
})
```

### Type test additions

**`test/types/request.test-d.ts`** — add inside the existing `getHandler`:
```typescript
expectType<AbortSignal>(request.signal)
expectType<number | undefined>(request.routeOptions.requestTimeout)
```

**`test/types/route.test-d.ts`** — add to existing route shorthand options assertions:
```typescript
expectAssignable<RouteShorthandOptions>({ requestTimeout: 5000 })
expectAssignable<RouteShorthandOptions>({ requestTimeout: 0 })
```
