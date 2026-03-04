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

