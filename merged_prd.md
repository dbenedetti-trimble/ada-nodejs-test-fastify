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

