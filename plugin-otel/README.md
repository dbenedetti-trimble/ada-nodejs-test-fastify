# fastify-otel

First-party OpenTelemetry instrumentation plugin for Fastify.

## Features

- Server request span covering the full request lifecycle (`onRequest` → `onResponse`)
- Route handler span as a child of the server span
- Configurable lifecycle hook spans per phase
- HTTP semantic convention attributes (stable OTel spec v1.23.0+)
- Error and exception recording on spans
- W3C Trace Context propagation from incoming `traceparent`/`tracestate` headers
- Zero overhead when `@opentelemetry/api` is not installed

## Installation

```bash
npm install fastify-otel
# @opentelemetry/api is a peer dependency — install it alongside your chosen OTel SDK
npm install @opentelemetry/api @opentelemetry/sdk-trace-node
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('fastify-otel')

fastify.register(otelPlugin, {
  exposeApi: true,       // default: true
  hookSpans: true,       // default: true
  ignoreRoutes: [],      // default: []
  spanNameFormatter: null,
})
```

## Plugin options

| Option | Type | Default | Description |
|---|---|---|---|
| `exposeApi` | `boolean` | `true` | Register `fastify.otel` and `request.otelSpan` decorators |
| `hookSpans` | `boolean` | `true` | Create child spans per lifecycle hook phase |
| `ignoreRoutes` | `string[]` | `[]` | Route URL patterns excluded from instrumentation |
| `spanNameFormatter` | `(req) => string` | `null` | Override default `METHOD /route` span naming |

## Decorators

- `fastify.otel.tracer` — the OTel `Tracer` instance used by the plugin
- `request.otelSpan` — the active server span for the current request

## No-op behavior

When `@opentelemetry/api` is not installed, the plugin registers without error and adds no hooks. There is zero overhead on the request path.

## License

MIT
