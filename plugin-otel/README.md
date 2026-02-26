# fastify-otel

First-party OpenTelemetry instrumentation plugin for Fastify. Instruments the full request lifecycle using Fastify's hook system and produces server spans, handler spans, and lifecycle hook spans following the [OTel HTTP semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/).

## Requirements

- Fastify `>=5.0.0`
- `@opentelemetry/api` `>=1.4.0` (optional peer dependency — plugin is a no-op when absent)

## Installation

```bash
npm install fastify-otel
# Peer dependency (bring your own SDK):
npm install @opentelemetry/api
```

## Usage

```javascript
const Fastify = require('fastify')
const otelPlugin = require('fastify-otel')

const fastify = Fastify()

// Register the plugin BEFORE adding application hooks to ensure full
// hook-span coverage (see "Hook spans" section below).
await fastify.register(otelPlugin, {
  exposeApi: true,       // Default: true
  hookSpans: true,       // Default: true
  ignoreRoutes: [],      // Route patterns to exclude
  spanNameFormatter: null // Optional custom span name function
})

fastify.get('/users/:id', async (request, reply) => {
  // Access the server span for the current request
  request.otelSpan.setAttribute('user.id', request.params.id)

  // Create a child span using the tracer
  const dbSpan = fastify.otel.tracer.startSpan('db.query')
  // ... do work
  dbSpan.end()

  return { id: request.params.id }
})

await fastify.listen({ port: 3000 })
```

## Configuration options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `exposeApi` | `boolean` | `true` | Registers `fastify.otel` decorator and `request.otelSpan` on the request object |
| `hookSpans` | `boolean` | `true` | Creates child spans for each lifecycle hook phase that has registered hooks |
| `ignoreRoutes` | `string[]` | `[]` | Route URL patterns to exclude from instrumentation (matched against `request.routeOptions.url`) |
| `spanNameFormatter` | `function` | `null` | Custom function `(request) => string` to override the default span name (`{METHOD} {route}`) |

## Spans created

### Server span (`SpanKind.SERVER`)

One span per instrumented request covering the full lifecycle (`onRequest` → `onResponse`). Span name defaults to `{METHOD} {route}` (e.g. `GET /users/:id`). For 404s the span name is just the HTTP method.

Attributes set at request start:

| Attribute | Source |
| --- | --- |
| `http.request.method` | `request.method` |
| `url.path` | Path portion of `request.url` |
| `url.query` | Query string (omitted when absent) |
| `url.scheme` | `http` or `https` |
| `server.address` | `request.hostname` |
| `server.port` | Server listening port |
| `network.protocol.version` | HTTP version |
| `user_agent.original` | `user-agent` header (omitted when absent) |
| `http.request.header.content-length` | Request content-length (omitted when absent) |

Attributes set at response:

| Attribute | Source |
| --- | --- |
| `http.response.status_code` | `reply.statusCode` |
| `http.route` | Parameterized route pattern (omitted for 404s) |
| `http.response.header.content-length` | Response content-length (omitted when absent) |

### Handler span (`fastify.handler`)

A child span of the server span covering the route handler execution (`preHandler` → `onSend`).

### Hook spans (`fastify.hook.{hookName}`)

When `hookSpans: true`, a child span is created for each lifecycle phase that has registered hooks. Supported phases:

- `fastify.hook.onRequest`
- `fastify.hook.preParsing`
- `fastify.hook.preValidation`
- `fastify.hook.preHandler`
- `fastify.hook.preSerialization`
- `fastify.hook.onSend`
- `fastify.hook.onError` (only when an error occurs)

Phases with no registered hooks produce no spans.

## Error recording

- Handler exceptions are recorded on the handler span via `span.recordException()` and set its status to `ERROR`.
- Responses with a 5xx status code set the server span status to `ERROR`.
- Responses with a 4xx status code leave the server span status as `UNSET` (client errors are not server errors per OTel convention).

## W3C Trace Context propagation

Incoming `traceparent` and `tracestate` headers are automatically extracted and used as the parent context for the server span.

## Zero overhead when OTel is not installed

When `@opentelemetry/api` is not installed, the plugin registers without error, adds no hooks, and adds no decorators. There is no measurable overhead on request throughput.

## Hook spans limitation

Hook spans only wrap hooks registered **after** the plugin. If application hooks are added to the Fastify instance before `fastify.register(otelPlugin)` is called, those hooks will not be covered by hook spans. Register this plugin first to ensure complete coverage.

## Decorator API

When `exposeApi: true` (the default):

```javascript
// Tracer instance used by the plugin
fastify.otel.tracer // OpenTelemetry Tracer

// Server span for the current request (undefined for ignored routes or when OTel is not installed)
request.otelSpan
```

## License

MIT
