# fastify-otel

OpenTelemetry instrumentation plugin for Fastify. Instruments the full request lifecycle using Fastify's native hook system.

## Install

```bash
npm install fastify-otel @opentelemetry/api
```

You also need an OTel SDK and exporter:

```bash
npm install @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-http
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('fastify-otel')

fastify.register(otelPlugin, {
  exposeApi: true,           // default: true
  hookSpans: true,           // default: true
  ignoreRoutes: ['/health'], // optional
  spanNameFormatter: null    // optional: (request) => string
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exposeApi` | `boolean` | `true` | Register `fastify.otel` and `request.otelSpan` decorators |
| `hookSpans` | `boolean` | `true` | Create child spans for each lifecycle hook phase |
| `ignoreRoutes` | `string[]` | `[]` | Route URL patterns to exclude from instrumentation |
| `spanNameFormatter` | `(request) => string` | `null` | Custom span name formatter |

## Decorators

When `exposeApi: true`:

- `fastify.otel.tracer` — the `Tracer` instance used by the plugin
- `request.otelSpan` — the server span for the current request (`Span | null`)

## Zero overhead

When `@opentelemetry/api` is not installed, the plugin registers without error and adds no hooks. No `MODULE_NOT_FOUND` errors are thrown.
