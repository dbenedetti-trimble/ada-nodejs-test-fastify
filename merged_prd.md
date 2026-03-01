# Product Requirements Document (PRD)
**Repository**: `https://github.com/dbenedetti-trimble/ada-nodejs-test-fastify`

---


# Context & Problem


## Problem statement

- **Who is affected?** Developers running Fastify in production who need distributed tracing and observability through OpenTelemetry.
- **What is the issue?** Fastify has no built-in OpenTelemetry instrumentation. Developers rely on the community `@opentelemetry/instrumentation-fastify` package, which works via monkey-patching and can lag behind Fastify releases. Alternatively, they instrument manually with ad-hoc spans, resulting in inconsistent trace quality across routes and missing lifecycle visibility. Fastify already publishes `diagnostics_channel` events (via `diagnostics.tracingChannel('fastify.request.handler')`), but these are low-level and don't produce OTel spans without extra glue code.
- **Why does it matter?** First-party OTel instrumentation that uses Fastify's own hook system produces richer, more reliable traces than external monkey-patching. It can instrument the full request lifecycle (not just the handler), follows Fastify's plugin conventions, and stays in sync with core changes. When the OTel SDK is not installed, the instrumentation must add zero overhead -- no conditional checks on the hot path, no require errors, no wasted allocations.

## Success metrics


|                      Metric                      |    Baseline    |                       Target                        |         Validation method          |
| ------------------------------------------------ | -------------- | --------------------------------------------------- | ---------------------------------- |
| Server span created per request when OTel active | No spans       | One `HTTP {METHOD} {route}` span per request        | Unit tests with in-memory exporter |
| Hook lifecycle spans captured                    | No spans       | Named span per lifecycle phase (configurable)       | Unit tests                         |
| Route handler span with correct route pattern    | No spans       | `{METHOD} {route}` span name, e.g. `GET /users/:id` | Unit tests                         |
| Error recording on spans                         | No error data  | Exceptions and 5xx status recorded on span          | Unit tests                         |
| W3C Trace Context propagation                    | No propagation | Incoming `traceparent` header creates child span    | Unit tests                         |
| Zero overhead when OTel SDK absent               | N/A            | Plugin is a no-op; no measurable throughput impact  | Benchmark comparison               |
| All existing tests pass                          | 100% pass      | 100% pass (no regressions)                          | `npm run unit`                     |
| TypeScript types provided                        | N/A            | Plugin exports `.d.ts` with full type coverage      | `tsd` type tests                   |


# Scope & Constraints


## In scope

- New Fastify plugin providing OpenTelemetry instrumentation via Fastify's hook system
- Server request span covering the full request lifecycle (`onRequest` through `onResponse`)
- Route handler span as a child of the server span
- Configurable lifecycle hook spans (`onRequest`, `preValidation`, `preHandler`, `preSerialization`, `onSend`)
- HTTP semantic convention span attributes (method, route, status code, content length, etc.)
- Error and exception recording on spans
- W3C Trace Context propagation from incoming `traceparent`/`tracestate` headers
- Lazy detection of `@opentelemetry/api` -- full no-op when absent
- TypeScript type definitions for the plugin API
- Comprehensive test suite using the existing test infrastructure (`node:test` via `borp`)

## Out of scope

- Bundling or depending on the OpenTelemetry SDK (`@opentelemetry/sdk-trace-node`) -- users bring their own SDK and exporters
- Database or outbound HTTP call instrumentation (those are separate OTel instrumentations)
- Metrics or logging integration (spans/traces only)
- Custom span processors or exporters
- Changes to Fastify's existing `diagnostics_channel` infrastructure
- Modifying any existing Fastify core files (this is a self-contained plugin)
- Performance profiling or benchmarking tooling (manual benchmark is sufficient)

## Dependencies & Risks

- **`@opentelemetry/api`** **is a peer dependency only.** The plugin imports it dynamically and becomes a no-op if the import fails. This is the standard pattern for OTel instrumentations -- the API package is a thin interface (~50KB) with no-op defaults; the SDK provides the actual implementation.
- **Semantic convention stability**: OTel HTTP semantic conventions reached stable status in v1.23.0. The plugin should follow the stable conventions, not the experimental ones. Attribute names like `http.request.method`, `http.response.status_code`, `url.path`, `http.route` are stable.
- **Plugin pattern compliance**: The plugin must use `fastify-plugin` to break encapsulation so that hooks are registered at the root level and instrument all routes, not just routes in the same encapsulation context.
- **Test runner**: Tests must use `node:test` (via `borp`), matching Fastify's existing test infrastructure. Do not introduce Jest, Mocha, or other test runners.
- **Async context propagation**: OTel relies on `AsyncLocalStorage` internally for context propagation. Fastify's hook pipeline is async-safe, but the plugin must ensure OTel context is active during handler execution so that child spans created by user code (e.g., database calls) are correctly parented.
- **Performance risk**: Adding hooks to every request has a cost. The plugin registers hooks only when OTel is detected, and hook functions should be as lean as possible -- no allocations beyond span creation.

# Functional Requirements


## OTEL-1: Plugin registration and OTel SDK detection


**Required behavior:**


The plugin registers via `fastify.register()` with a configuration object:


```javascript
const fastify = require('fastify')()
const otelPlugin = require('./plugin-otel')

fastify.register(otelPlugin, {
  exposeApi: true,
  hookSpans: true,
  ignoreRoutes: [],
  spanNameFormatter: null,
})
```


On registration, the plugin attempts to require `@opentelemetry/api`. If the require fails (module not installed), the plugin:

1. Logs a debug-level message: `@opentelemetry/api not found, instrumentation disabled`
2. Does not register any hooks
3. Does not register any decorators
4. Returns immediately (no-op)

If the require succeeds but no `TracerProvider` is configured, the plugin still registers hooks but OTel's internal no-op implementation ensures zero trace output with minimal overhead.


**Acceptance criteria:**

- Plugin registers without errors when `@opentelemetry/api` is installed and an SDK is configured
- Plugin registers without errors when `@opentelemetry/api` is installed but no SDK is configured (no-op tracer)
- Plugin registers without errors when `@opentelemetry/api` is not installed (full no-op, no hooks registered)
- When `exposeApi` is true, `fastify.otel` decorator is available with the tracer instance
- Plugin uses `fastify-plugin` wrapper so hooks apply to all routes regardless of encapsulation
- `ignoreRoutes` patterns exclude matching routes from instrumentation

## OTEL-2: Server request span


**Required behavior:**


For each instrumented request, the plugin creates a server span that covers the full request lifecycle:

- **Start**: In `onRequest` hook (earliest lifecycle point)
- **End**: In `onResponse` hook (after response is fully sent to client)
- **Span kind**: `SpanKind.SERVER`
- **Span name**: `{METHOD} {route_pattern}` (e.g., `GET /users/:id`)

The span is stored on the request object via a symbol so it's accessible in later hooks and the handler.


**Acceptance criteria:**

- One server span is created per request
- Span starts during `onRequest` and ends during `onResponse`
- Span name uses the route pattern (parameterized), not the actual URL
- Span kind is `SERVER`
- Span is accessible from the request object for user code to add custom attributes
- When the route is a 404, span name is `{METHOD}` with an attribute indicating unmatched route
- Span duration accurately reflects the full request processing time

## OTEL-3: Route handler span


**Required behavior:**


A child span is created for the route handler execution:

- **Start**: Immediately before the handler function is called
- **End**: When the handler returns (sync), its promise resolves/rejects (async), or `reply.send()` is called
- **Span name**: `fastify.handler`
- **Parent**: The server request span from OTEL-2

**Acceptance criteria:**

- A `fastify.handler` span is created as a child of the server span
- Span duration covers only handler execution (not hooks)
- Span is created for async handlers that return promises
- Span is created for sync handlers that call `reply.send()`
- If the handler throws, the span records the exception and sets error status before ending
- Handler span is not created for routes in `ignoreRoutes`

## OTEL-4: Lifecycle hook spans (configurable)


**Required behavior:**


When `hookSpans: true` (default), the plugin creates child spans for lifecycle hook phases:


|        Hook phase        |            Span name            |             Notes              |
| ------------------------ | ------------------------------- | ------------------------------ |
| `onRequest` hooks        | `fastify.hook.onRequest`        | All registered onRequest hooks |
| `preParsing` hooks       | `fastify.hook.preParsing`       | Body parsing preparation       |
| `preValidation` hooks    | `fastify.hook.preValidation`    | Before schema validation       |
| `preHandler` hooks       | `fastify.hook.preHandler`       | Before route handler           |
| `preSerialization` hooks | `fastify.hook.preSerialization` | Before response serialization  |
| `onSend` hooks           | `fastify.hook.onSend`           | Before sending response        |
| `onError` hooks          | `fastify.hook.onError`          | Only when errors occur         |


Each span covers the execution of all hooks in that phase (not individual hooks). These are children of the server request span.


When `hookSpans: false`, only the server span and handler span are created.


**Acceptance criteria:**

- With `hookSpans: true`, each hook phase that executes produces a child span
- Span names follow the `fastify.hook.{hookName}` convention
- Hook spans are children of the server request span, siblings of the handler span
- With `hookSpans: false`, no hook spans are created
- Hook phases that have no registered hooks do not produce spans
- `onError` hook span is only created when an error actually occurs
- `onResponse` does not get its own hook span (it's the end point of the server span)

## OTEL-5: Span attributes (HTTP semantic conventions)


**Required behavior:**


The server request span carries attributes following OTel HTTP semantic conventions (stable as of v1.23.0):


**Set at span creation (onRequest):**


|              Attribute               |               Source                |      Example      |
| ------------------------------------ | ----------------------------------- | ----------------- |
| `http.request.method`                | `request.method`                    | `GET`             |
| `url.path`                           | `request.url` (path only)           | `/users/42`       |
| `url.query`                          | `request.url` (query only)          | `page=2&limit=10` |
| `url.scheme`                         | Connection protocol                 | `http` or `https` |
| `server.address`                     | `request.hostname`                  | `api.example.com` |
| `server.port`                        | Server listening port               | `3000`            |
| `network.protocol.version`           | `request.raw.httpVersion`           | `1.1`             |
| `user_agent.original`                | `request.headers['user-agent']`     | `curl/7.88.0`     |
| `http.request.header.content-length` | `request.headers['content-length']` | `256`             |


**Set at span completion (onResponse):**


|               Attribute               |               Source                |   Example    |
| ------------------------------------- | ----------------------------------- | ------------ |
| `http.response.status_code`           | `reply.statusCode`                  | `200`        |
| `http.route`                          | `request.routeOptions.url`          | `/users/:id` |
| `http.response.header.content-length` | `reply.getHeader('content-length')` | `1024`       |


**Acceptance criteria:**

- All listed attributes are set on the server span
- `http.route` uses the parameterized pattern, not the resolved URL
- `url.query` is omitted (not set) when there is no query string
- `user_agent.original` is omitted when the header is absent
- Attributes use the stable semantic convention names
- Numeric values (`status_code`, `port`, `content-length`) are set as numbers, not strings

## OTEL-6: Error recording on spans


**Required behavior:**


When errors occur during request processing:

1. **Handler throws/rejects**: The handler span records the exception via `span.recordException(error)` and sets span status to `SpanStatusCode.ERROR` with the error message.
2. **5xx response**: The server span sets status to `SpanStatusCode.ERROR` regardless of whether an exception was thrown.
3. **4xx response**: The server span status remains `UNSET` (client errors are not server errors in OTel convention).
4. **`onError`** **hook fires**: If `hookSpans` is enabled, the `onError` hook span records the error.

**Acceptance criteria:**

- Handler exceptions are recorded on the handler span via `recordException`
- Handler span status is set to ERROR when the handler throws
- Server span status is set to ERROR for 5xx responses
- Server span status is UNSET for 4xx responses
- The error message is included in the span status description
- Errors that occur in hooks (not the handler) are recorded on the server span
- Both sync thrown errors and async rejected promises are captured

## OTEL-7: W3C Trace Context propagation


**Required behavior:**


The plugin extracts trace context from incoming request headers using OTel's `propagation.extract()` API:

1. In the `onRequest` hook, before creating the server span, extract context from request headers
2. Create the server span as a child of the extracted context (if present)
3. If no trace context headers are present, the server span starts a new trace
4. The active context with the server span is made available during handler execution

The plugin uses `context.with()` to ensure the OTel context is active during the request lifecycle.


**Supported headers:**

- `traceparent` (W3C Trace Context)
- `tracestate` (W3C Trace Context)

**Acceptance criteria:**

- Request with valid `traceparent` header creates a server span that is a child of the incoming trace
- The trace ID from the incoming `traceparent` is preserved in the server span
- Request without trace context headers starts a new trace (new trace ID)
- `tracestate` values are propagated to the server span's context
- Child spans created inside the handler are parented to the server span
- Context propagation works correctly with both async and callback-style handlers

## OTEL-8: Zero overhead when OTel is not installed


**Required behavior:**


When `@opentelemetry/api` is not installed as a dependency:

1. The plugin's `require('@opentelemetry/api')` is wrapped in a try/catch
2. On failure, the plugin returns immediately without registering hooks or decorators
3. No references to OTel types or APIs exist in the hook code paths
4. The plugin does not throw, does not add hooks, does not add overhead

When `@opentelemetry/api` is installed but no `TracerProvider` is configured:

1. The plugin registers hooks normally
2. OTel's built-in no-op implementation handles all API calls (returns no-op spans)
3. Overhead is minimal (function call overhead for no-op span operations)

**Acceptance criteria:**

- Fastify starts and serves requests normally when the plugin is registered but `@opentelemetry/api` is not in `node_modules`
- No `MODULE_NOT_FOUND` errors are thrown
- No hooks are registered in the no-module case (verified by checking hook counts)
- A basic throughput benchmark shows no measurable difference with the plugin registered (no OTel installed) vs. without the plugin
- When OTel API is installed without SDK, hooks run but produce no trace output

## OTEL-9: Decorator API for user access


**Required behavior:**


When `exposeApi: true` (default), the plugin registers a `fastify.otel` decorator:


```javascript
const tracer = fastify.otel.tracer

fastify.get('/users/:id', async (request, reply) => {
  const span = request.otelSpan
  span.setAttribute('user.id', request.params.id)

  const dbSpan = fastify.otel.tracer.startSpan('db.query', {
    parent: span
  })
  dbSpan.end()
})
```


**Acceptance criteria:**

- `fastify.otel.tracer` returns the `Tracer` instance used by the plugin
- `request.otelSpan` returns the server span for the current request
- `request.otelSpan` is `undefined` when the route is in `ignoreRoutes`
- `request.otelSpan` is `undefined` when OTel is not installed
- Custom attributes set via `request.otelSpan.setAttribute()` appear on the exported span
- The decorator throws `FST_ERR_DEC_ALREADY_PRESENT` if `otel` decorator already exists

# Technical Solution


## Architecture & Components


The plugin is a new directory in the repository root. No existing files are modified.


```javascript
plugin-otel/
  index.js
  lib/
    otel-api.js
    span-attributes.js
    context-propagation.js
  types/
    index.d.ts
  test/
    basic.test.js
    server-span.test.js
    handler-span.test.js
    hook-spans.test.js
    attributes.test.js
    errors.test.js
    propagation.test.js
    ignore-routes.test.js
    integration.test.js
  README.md
  package.json
```


## Implementation notes


**Lazy OTel API loader (****`lib/otel-api.js`****):**


```javascript
let api = null

function loadOtelApi () {
  if (api !== null) return api
  try {
    api = require('@opentelemetry/api')
  } catch {
    api = false
  }
  return api
}
```


The loader is called once during plugin registration. If it returns `false`, the plugin bails out immediately.


**Plugin entry point (****`index.js`****):**


```javascript
const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const { trace, SpanKind, SpanStatusCode } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes ?? [])
  const formatSpanName = opts.spanNameFormatter ?? defaultSpanName

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    if (ignoreRoutes.has(request.routeOptions?.url)) return done()
    const parentContext = extractContext(otel, request.headers)
    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request) },
      parentContext
    )
    request[kOtelSpan] = span
    if (opts.exposeApi !== false) request.otelSpan = span
    done()
  })

  fastify.addHook('onResponse', function onResponseOtel (request, reply, done) {
    const span = request[kOtelSpan]
    if (!span) return done()
    span.setAttributes(buildResponseAttributes(request, reply))
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP ' + reply.statusCode })
    }
    span.end()
    done()
  })
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
```


**Hook span instrumentation:**


For hook spans, the plugin registers its own hooks at each lifecycle point that create and end child spans. Since Fastify runs hooks sequentially, the plugin uses paired hooks to measure phase duration.


**Handler span:**


A `preHandler` hook starts the handler span. An `onSend` hook ends it. An `onError` hook records exceptions. This approach includes preSerialization time in the handler span, which is a documented trade-off (best achievable without modifying core files).


**Context propagation (****`lib/context-propagation.js`****):**


```javascript
function extractContext (otel, headers) {
  const { propagation, ROOT_CONTEXT } = otel
  return propagation.extract(ROOT_CONTEXT, headers, {
    get (carrier, key) { return carrier[key] },
    keys (carrier) { return Object.keys(carrier) }
  })
}
```


## Testing approach


Tests use an in-memory span exporter from `@opentelemetry/sdk-trace-node` (dev dependency). Each test creates a Fastify instance, registers the plugin, injects a request, and inspects exported spans.


## Dependency changes

- **Runtime (peer)**: `@opentelemetry/api` >= 1.4.0 (peer dependency, optional)
- **Dev**: `@opentelemetry/api`, `@opentelemetry/sdk-trace-node` (for test in-memory exporter)

# Validation Contract


## VAL-01: Plugin registers with OTel SDK configured


```javascript
GIVEN a Fastify instance AND @opentelemetry/api is installed with a configured TracerProvider
WHEN I register the otel plugin with default options
THEN the plugin registers without error
AND fastify.otel.tracer is available
AND request hooks are registered
```


## VAL-02: Plugin is no-op when @opentelemetry/api is missing


```javascript
GIVEN a Fastify instance AND @opentelemetry/api is NOT installed
WHEN I register the otel plugin
THEN the plugin registers without error
AND no hooks are added to the Fastify instance
AND fastify.otel is NOT defined
```


## VAL-03: Plugin registers when OTel API installed but no SDK configured


```javascript
GIVEN @opentelemetry/api installed but no TracerProvider configured
WHEN I register the otel plugin
THEN the plugin registers without error
AND hooks are registered
AND requests produce no exported spans
```


## VAL-04: Server span covers full request lifecycle


```javascript
GIVEN an instrumented Fastify instance with in-memory exporter
AND a route GET /test returning { ok: true }
WHEN I send a GET request to /test
THEN exactly one span with kind SERVER is exported
AND the span name is "GET /test"
```


## VAL-05: Server span uses route pattern, not resolved URL


```javascript
GIVEN an instrumented route GET /users/:id
WHEN I send GET /users/42
THEN server span name is "GET /users/:id"
AND http.route is "/users/:id"
AND url.path is "/users/42"
```


## VAL-06: Handler span is a child of server span


```javascript
GIVEN an instrumented route
WHEN I send a GET request
THEN a SERVER span and an INTERNAL "fastify.handler" span are exported
AND the handler span's parent is the server span
```


## VAL-07: Hook spans created when hookSpans is true


```javascript
GIVEN hookSpans: true and a route with onRequest and preHandler hooks
WHEN I send a GET request
THEN "fastify.hook.onRequest" and "fastify.hook.preHandler" spans are exported
AND each is a child of the server span
```


## VAL-08: No hook spans when hookSpans is false


```javascript
GIVEN hookSpans: false
WHEN I send a GET request to a route with hooks
THEN only server span and handler span are exported
```


## VAL-09: HTTP semantic convention attributes on server span


```javascript
GIVEN an instrumented route GET /items?page=2
WHEN I send a GET request with User-Agent: "test-agent"
THEN the server span has http.request.method="GET", url.path="/items",
  url.query="page=2", http.response.status_code=200, user_agent.original="test-agent"
AND http.response.status_code is a number
```


## VAL-10: Error recording on handler exception


```javascript
GIVEN a handler that throws Error('db failed')
WHEN I send a GET request
THEN handler span status is ERROR with message "db failed"
AND server span status is ERROR
AND http.response.status_code is 500
```


## VAL-11: 5xx response without exception sets error status


```javascript
GIVEN a handler that calls reply.code(503).send({ error: 'unavailable' })
WHEN I send a GET request
THEN server span status is ERROR with message "HTTP 503"
AND handler span status is UNSET
```


## VAL-12: 4xx response does not set error status


```javascript
GIVEN a handler returning reply.code(404).send({ error: 'not found' })
WHEN I send a GET request
THEN server span status is UNSET
AND http.response.status_code is 404
```


## VAL-13: W3C Trace Context propagation from incoming headers


```javascript
GIVEN an instrumented Fastify instance
WHEN I send GET with traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
THEN server span trace ID is "4bf92f3577b34da6a3ce929d0e0e4736"
AND parent span ID is "00f067aa0ba902b7"
```


## VAL-14: New trace started when no traceparent header


```javascript
GIVEN an instrumented Fastify instance
WHEN I send GET without traceparent header
THEN server span has a new trace ID and no parent span ID
```


## VAL-15: Child spans in handler are parented correctly


```javascript
GIVEN a handler that creates a span via fastify.otel.tracer.startSpan('custom')
WHEN I send a GET request
THEN the "custom" span's parent is the server span
```


## VAL-16: ignoreRoutes excludes routes from instrumentation


```javascript
GIVEN ignoreRoutes: ['/health'] and routes GET /health and GET /api/data
WHEN I send requests to both
THEN GET /api/data produces a span
AND GET /health produces no spans
```


## VAL-17: request.otelSpan provides access to server span


```javascript
GIVEN a handler calling request.otelSpan.setAttribute('custom.key', 'value')
WHEN I send a GET request
THEN the server span has attribute custom.key = "value"
```


## VAL-18: Custom spanNameFormatter overrides default naming


```javascript
GIVEN a custom spanNameFormatter
WHEN I send a GET request
THEN server span name matches the custom formatter output
```


## VAL-19: Multiple routes produce independent spans


```javascript
GIVEN routes GET /a and GET /b
WHEN I send GET to /a then GET to /b
THEN two server spans exported with names "GET /a" and "GET /b"
```


## VAL-20: Async handler spans complete correctly


```javascript
GIVEN an async handler with a 50ms delay
WHEN I send a GET request
THEN handler span duration >= 50ms
AND both spans end without error status
```


## VAL-21: No regressions in existing test suite


```javascript
GIVEN all plugin files are added
WHEN I run npm run unit
THEN all existing Fastify tests pass
AND npm run test:typescript passes
```


---

# Technical Context
# Technical Context: Fastify OpenTelemetry Plugin (`plugin-otel`)

---

## Verified Tech Stack

**From `package.json` (`"version"` and `"dependencies"` / `"devDependencies"` sections):**

- **Runtime**: Node.js 20.x (confirmed: `node --version` = v20.20.0; no `engines` field in package.json)
- **Framework**: Fastify 5.7.4 (`"version": "5.7.4"` in package.json; module system: CommonJS — `"type": "commonjs"`)
- **Package Manager**: npm (package-lock.json present; no `engines.npm` constraint)
- **Plugin helper**: `fastify-plugin ^5.0.0` (from `devDependencies` — must be listed as a production dependency in `plugin-otel/package.json`)
- **Test runner**: `borp ^1.0.0` (from `devDependencies`); wraps `node:test` natively
- **TypeScript type tests**: `tsd ^0.33.0` (from `devDependencies`); test files live in `test/types/*.test-d.ts`
- **TypeScript compiler**: `typescript ~5.9.2` (from `devDependencies`)
- **New peer dependency (plugin-otel)**: `@opentelemetry/api >=1.4.0` — not currently in `package.json`; must be added to `plugin-otel/package.json` as `peerDependencies`
- **New dev dependency (plugin-otel tests)**: `@opentelemetry/api` and `@opentelemetry/sdk-trace-node` — must be added to `plugin-otel/package.json` as `devDependencies` for in-memory exporter usage in tests

---

## Relevant Files & Patterns

### Existing codebase files relevant to this implementation

- `fastify.js` — Main entry point (Fastify 5.7.4). References `fastify.version` (the string `'5.7.4'`), used as the second argument to `trace.getTracer('fastify', fastify.version)`.
- `lib/hooks.js` — Defines all lifecycle hook names. The full ordered lifecycle is: `onRequest → preParsing → preValidation → preSerialization → preHandler → onSend → onResponse`. Error path goes through `onError`. All hook names used in span naming are validated here.
- `lib/symbols.js` — Establishes the pattern for Symbol-keyed storage on request/reply objects (e.g., `kReplyStartTime = Symbol('fastify.reply.startTime')`). The plugin should follow this pattern with `const kOtelSpan = Symbol('fastify.otel.span')` defined locally in `plugin-otel/index.js`.
- `lib/request.js` (`routeOptions` getter, line 176) — `request.routeOptions.url` returns `context.config?.url`, which is the parameterized route pattern (e.g., `/users/:id`). Returns `undefined` for 404 requests (`request.is404 === true`).
- `lib/request.js` (`method` getter, line 172) — `request.method` proxies `request.raw.method`.
- `lib/reply.js` (`statusCode` getter) — `reply.statusCode` returns `this.raw.statusCode` (a number). `reply.getHeader(key)` is available via `Reply.prototype.getHeader`.
- `lib/decorate.js` (`decorateRequest` function, line 129) — `fastify.decorateRequest(name, defaultValue)` registers a property on all request objects with the given default. Must be called during plugin initialization before the server starts. Uses `FST_ERR_DEC_AFTER_START` if called late.
- `lib/errors.js` (line 141) — `FST_ERR_DEC_ALREADY_PRESENT` is thrown automatically by `fastify.decorate()` / `fastify.decorateRequest()` if the decorator name is already registered. No manual check needed in the plugin.
- `lib/handle-request.js` (line 17) — Uses `diagnostics.tracingChannel('fastify.request.handler')` for internal tracing. The plugin does **not** use this channel; it instruments via the hook system instead.
- `.borp.yaml` — Root test runner config scans `test/**/*.test.js` and `test/**/*.test.mjs` only. Plugin tests at `plugin-otel/test/*.test.js` are **outside this glob** and will not run with root `npm run unit`. The `plugin-otel/package.json` must define its own `test` script using `borp`.
- `fastify.d.ts` and `types/plugin.d.ts` — TypeScript patterns: plugins are typed as `FastifyPluginCallback<Options>` or `FastifyPluginAsync<Options>`. The plugin's `types/index.d.ts` must augment `FastifyInstance` and `FastifyRequest` interfaces.
- `test/types/*.test-d.ts` — TypeScript type test pattern using `tsd`. Plugin type tests should follow the same `expectType<>` / `expectAssignable<>` style.

### Existing patterns to follow

- **Plugin registration with `fastify-plugin`**: From `test/plugin.1.test.js` and `lib/` — use `fp(pluginFn, { fastify: '5.x', name: 'fastify-otel' })` to break encapsulation. This is the established pattern for plugins that must instrument all routes regardless of registration context.
- **Hook registration**: From `lib/hooks.js` (Hooks class) — use `fastify.addHook(hookName, fn)` where `fn` follows the `(request, reply, done)` signature for lifecycle hooks. Async hooks that return a promise are also supported.
- **Symbol-keyed properties on request**: From `lib/symbols.js` — define `const kOtelSpan = Symbol('fastify.otel.span')` in the plugin file. Access as `request[kOtelSpan]` inside hook functions. This avoids name collisions with user-defined properties.
- **Request decoration with default value**: From `lib/decorate.js` — `fastify.decorateRequest('otelSpan', null)` pre-declares the property with a `null` default. This is required for Fastify 5.x (non-reference types like `null` are allowed as defaults; objects/arrays need a factory function).
- **Test injection pattern**: From `test/inject.test.js` and `test/async-await.test.js` — use `fastify.inject({ method, url, headers })` for HTTP simulation. Both callback and `await` forms are used across the test suite.
- **Test assertion style**: From `test/hooks.test.js` — use `t.assert.strictEqual`, `t.assert.ok`, `t.assert.deepStrictEqual`, `t.assert.ifError`. The test file starts with `const { test } = require('node:test')`. Use `t.plan(n)` for assertion counting. Use `t.after(() => fastify.close())` for cleanup.
- **Async test pattern**: From `test/async-await.test.js` — `test('name', async t => { ... })` with `await fastify.ready()` or `await fastify.listen({ port: 0 })`.

---

## Integration Points

### Systems and modules affected

- **`plugin-otel/` directory (new)**: Self-contained plugin directory at the repository root. No existing files in `lib/`, `test/`, or `fastify.js` are modified.
- **`@opentelemetry/api` (external peer dependency)**: Loaded lazily at plugin registration time via `try { require('@opentelemetry/api') } catch`. Not added to the root `package.json`; lives only in `plugin-otel/package.json` as a `peerDependency`.
- **`@opentelemetry/sdk-trace-node` (external dev dependency)**: Used only in plugin tests for the `InMemorySpanExporter` and `SimpleSpanProcessor`. Added to `plugin-otel/package.json` devDependencies.
- **`fastify-plugin` (root devDependency, plugin production dependency)**: Already at `^5.0.0` in root `devDependencies`. Must be declared as a production `dependency` in `plugin-otel/package.json` since `fp()` wraps the plugin function at module load time.
- **Root `.borp.yaml`**: Not modified. Plugin tests run independently via `plugin-otel/package.json` scripts. Root `npm run unit` does not execute plugin tests; VAL-21 verifies existing core tests still pass.
- **Root `fastify.d.ts` / `types/`**: Not modified. Plugin type augmentation is entirely within `plugin-otel/types/index.d.ts` using TypeScript's module augmentation of `'fastify'`.

### Impact boundary

All changes are additive and contained in the new `plugin-otel/` directory. Zero modifications to Fastify core (`fastify.js`, `lib/`, `test/`, `types/`, root config files). The plugin decorates the Fastify instance and request object only when explicitly registered via `fastify.register(otelPlugin, opts)`.

---

## Data Persistence

No database or persistent storage involved. The plugin attaches a single span reference to each request object for the duration of that request's lifecycle, stored via a private Symbol key (`kOtelSpan`) and released when the span ends in `onResponse`.

### Request-scoped span storage

```javascript
// In plugin-otel/index.js — symbol defined at module scope
const kOtelSpan = Symbol('fastify.otel.span')

// Set during onRequest hook
request[kOtelSpan] = span

// Read and cleared during onResponse hook
const span = request[kOtelSpan]
```

The exposed `request.otelSpan` decorator (when `exposeApi: true`) is a reference to the same span object, accessible to user route handlers. Default value is `null` (set via `fastify.decorateRequest('otelSpan', null)`).

---

## API Definitions

### Plugin public API surface (new)

**Plugin registration:**
```javascript
// plugin-otel/index.js — exported module
const otelPlugin = require('fastify-otel')  // or relative path

fastify.register(otelPlugin, {
  exposeApi: true,         // default: true — registers fastify.otel and request.otelSpan
  hookSpans: true,         // default: true — creates child spans per lifecycle phase
  ignoreRoutes: [],        // array of route URL patterns to skip (matched against request.routeOptions.url)
  spanNameFormatter: null  // optional function(request) => string; default: '{METHOD} {route}'
})
```

**Fastify instance decorator (`fastify.otel`):**
```javascript
fastify.otel.tracer  // returns the Tracer instance from trace.getTracer('fastify', fastify.version)
```

**Request decorator (`request.otelSpan`):**
```javascript
request.otelSpan  // returns the active server span (Span | null)
                  // null when OTel not installed, or route is in ignoreRoutes
```

### TypeScript augmentation pattern (in `plugin-otel/types/index.d.ts`)

```typescript
import { FastifyPluginCallback } from 'fastify'
import type { Tracer, Span } from '@opentelemetry/api'

export interface FastifyOtelOptions {
  exposeApi?: boolean
  hookSpans?: boolean
  ignoreRoutes?: string[]
  spanNameFormatter?: (request: FastifyRequest) => string
}

declare module 'fastify' {
  interface FastifyInstance {
    otel: { tracer: Tracer }
  }
  interface FastifyRequest {
    otelSpan: Span | null
  }
}

declare const otelPlugin: FastifyPluginCallback<FastifyOtelOptions>
export default otelPlugin
export { otelPlugin }
```

---

## Technical Constraints

- **Module system**: CommonJS only (`"type": "commonjs"` in root `package.json`). Plugin files must use `require()` / `module.exports`, not ESM `import`/`export`.
- **Fastify version constraint**: Plugin metadata must declare `{ fastify: '5.x' }` in the `fp()` wrapper, matching the installed Fastify version.
- **No hook registration before OTel check**: The `loadOtelApi()` call must be the first action inside the async plugin function body. If it returns falsy, the function must `return` immediately before any `addHook`, `decorate`, or `decorateRequest` call.
- **`fastify.decorateRequest` must use `null` default**: Fastify 5.x enforces that reference types (objects/arrays) passed as decorator defaults are shared across all requests. Use `null` (primitive) as the default for `request.otelSpan`; set the actual span via `request.otelSpan = span` inside the `onRequest` hook.
- **`request.routeOptions` availability in `onRequest`**: `request.routeOptions.url` is derived from `context.config?.url` (see `lib/request.js` line 183). It is populated before `onRequest` fires, so route-pattern-based ignore logic works correctly in `onRequest`.
- **Linting**: The repository uses neostandard (ESLint) configured via `eslint.config.js`. Plugin source files must pass `npm run lint` from the root. Follow `'use strict'` at top of every `.js` file, single quotes, 2-space indent, no semicolons at statement ends (standard style).
- **OTel HTTP semantic conventions**: Use stable attribute names from OTel v1.23.0+ (`http.request.method`, `http.response.status_code`, `url.path`, `url.query`, `http.route`, `url.scheme`, `server.address`, `server.port`, `network.protocol.version`, `user_agent.original`). Do not use deprecated experimental names (e.g., `http.method`, `http.status_code`).

---

## Dependencies & Linked Services

### `@opentelemetry/api` (peer dependency — external)

- **Purpose**: Provides `trace`, `context`, `propagation`, `SpanKind`, `SpanStatusCode` APIs
- **Integration**: Lazy `require()` in `plugin-otel/lib/otel-api.js` wrapped in try/catch; result cached in module-scope variable
- **Version constraint**: `>=1.4.0` (stable HTTP semantic conventions available from 1.4.0)
- **Note**: Users supply their own SDK (`@opentelemetry/sdk-trace-node`) and exporter; the plugin only depends on the thin API package

### `@opentelemetry/sdk-trace-node` (dev dependency — tests only)

- **Purpose**: Provides `InMemorySpanExporter` and `SimpleSpanProcessor` for inspecting exported spans in tests
- **Integration mechanism**:
```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider()
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
provider.register()

// After request: exporter.getFinishedSpans()
```

### `fastify-plugin` (production dependency in plugin-otel)

- **Purpose**: Breaks Fastify encapsulation so hooks registered by the plugin apply to all routes, not just routes within the same plugin scope
- **Integration**: `module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })`
- **Source**: Already installed in root `node_modules` at `^5.0.0`; must be declared in `plugin-otel/package.json` `dependencies` (not devDependencies)

---

## Testing Strategy

### Test file locations and runner configuration

Tests live in `plugin-otel/test/*.test.js`. The root `.borp.yaml` does not cover this path, so `plugin-otel/package.json` must include:

```json
{
  "scripts": {
    "test": "borp",
    "unit": "borp"
  }
}
```

With a `plugin-otel/.borp.yaml`:
```yaml
files:
  - 'test/**/*.test.js'
```

### Helper setup pattern (reusable across test files)

```javascript
// plugin-otel/test/helper.js
'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

function setupOtel () {
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider()
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
  provider.register()
  return { exporter, provider }
}

module.exports = { setupOtel }
```

### Test scenarios (10 scenarios — medium-high complexity: multiple hook phases + OTel integration)

**Happy path:**

```javascript
// VAL-04 / VAL-05 — server span created with correct name and route pattern
test('server span uses route pattern not resolved URL', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42')
})

// VAL-06 — handler span is child of server span
test('handler span is a child of server span', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /test')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.parentSpanId, serverSpan.spanContext().spanId)
})
```

**Edge cases:**

```javascript
// VAL-02 — plugin is no-op when @opentelemetry/api not installed
test('plugin is no-op when otel api missing', async t => {
  t.plan(2)
  // Use proxyquire to simulate missing module
  const proxyquire = require('proxyquire')
  const plugin = proxyquire('../index', {
    '@opentelemetry/api': null  // proxyquire callThru:false stub
  })
  const fastify = Fastify()
  await fastify.register(plugin)
  t.assert.strictEqual(fastify.hasDecorator('otel'), false)
  t.assert.strictEqual(fastify[Symbol.for('fastify.hooks')]?.onRequest?.length ?? 0, 0)
})

// VAL-08 — no hook spans when hookSpans: false
test('no hook spans when hookSpans is false', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const hookSpans = exporter.getFinishedSpans().filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0)
})

// VAL-12 — 4xx does not set error status on server span
test('4xx response does not set error status', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin)
  fastify.get('/test', async (req, reply) => reply.code(404).send({ error: 'not found' }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET)
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)
})
```

**Error cases:**

```javascript
// VAL-10 — handler exception sets ERROR on both spans
test('handler exception is recorded on handler and server spans', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('db failed') })
  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
})

// VAL-16 — ignoreRoutes excludes route from instrumentation
test('ignoreRoutes prevents span creation for matched routes', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/api' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.filter(s => s.name.includes('/health')).length, 0)
  t.assert.ok(spans.some(s => s.name === 'GET /api'))
})
```

**Integration (W3C propagation):**

```javascript
// VAL-13 — incoming traceparent creates child span with correct trace ID
test('W3C traceparent propagation creates child span', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  t.assert.strictEqual(serverSpan.parentSpanId, '00f067aa0ba902b7')
})

// VAL-09 — HTTP semantic convention attributes
test('server span carries correct HTTP semantic convention attributes', async t => {
  t.plan(4)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  await fastify.register(otelPlugin)
  fastify.get('/items', async () => ([]))
  await fastify.inject({
    method: 'GET',
    url: '/items?page=2',
    headers: { 'user-agent': 'test-agent' }
  })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.request.method'], 'GET')
  t.assert.strictEqual(span.attributes['url.query'], 'page=2')
  t.assert.strictEqual(span.attributes['user_agent.original'], 'test-agent')
  t.assert.strictEqual(typeof span.attributes['http.response.status_code'], 'number')
})
```

### TypeScript type test (in `plugin-otel/test/types/plugin.test-d.ts`)

```typescript
import { expectType, expectAssignable } from 'tsd'
import fastify, { FastifyInstance } from 'fastify'
import otelPlugin, { FastifyOtelOptions } from '../../types/index'
import type { Tracer, Span } from '@opentelemetry/api'

const app = fastify()
expectAssignable<FastifyInstance>(app.register(otelPlugin, { hookSpans: false }))

app.register(otelPlugin).after(() => {
  expectType<Tracer>(app.otel.tracer)
})

app.get('/test', async (request) => {
  expectType<Span | null>(request.otelSpan)
})
```
