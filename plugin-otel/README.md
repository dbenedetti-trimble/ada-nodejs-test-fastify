# fastify-otel

First-party OpenTelemetry instrumentation plugin for Fastify.

## Install

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('./plugin-otel')

fastify.register(otelPlugin, {
  exposeApi: true,
  hookSpans: true,
  ignoreRoutes: ['/health'],
  spanNameFormatter: null
})
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `exposeApi` | `boolean` | `true` | Expose `fastify.otel` and `request.otelSpan` decorators |
| `hookSpans` | `boolean` | `true` | Create child spans for lifecycle hook phases |
| `ignoreRoutes` | `string[]` | `[]` | Route patterns to exclude from instrumentation |
| `spanNameFormatter` | `Function\|null` | `null` | Custom `(request) => string` for span naming |

## Decorators

- `fastify.otel.tracer` - The OTel Tracer instance
- `request.otelSpan` - The server span for the current request

## Behavior Without OTel

When `@opentelemetry/api` is not installed, the plugin is a complete no-op with zero overhead.
