# fastify-otel

OpenTelemetry instrumentation plugin for Fastify. Instruments the full request lifecycle via Fastify's hook system, producing server spans, handler spans, and optional lifecycle hook spans following OTel HTTP semantic conventions (stable v1.23.0+).

## Installation

```bash
npm install fastify-otel @opentelemetry/api
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('fastify-otel')

fastify.register(otelPlugin, {
  exposeApi: true,       // registers fastify.otel and request.otelSpan (default: true)
  hookSpans: true,       // creates child spans per lifecycle phase (default: true)
  ignoreRoutes: [],      // route patterns to exclude from instrumentation
  spanNameFormatter: null // custom function(request) => string
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exposeApi` | boolean | `true` | Registers `fastify.otel.tracer` and `request.otelSpan` |
| `hookSpans` | boolean | `true` | Creates child spans for each lifecycle hook phase |
| `ignoreRoutes` | string[] | `[]` | Route URL patterns excluded from instrumentation |
| `spanNameFormatter` | function | null | Custom span name function: `(request) => string` |

## Decorators

When `exposeApi: true`:

- `fastify.otel.tracer` — the `Tracer` instance
- `request.otelSpan` — the server span for the current request (`Span | null`)

## Spans Produced

| Span Name | Kind | Notes |
|-----------|------|-------|
| `{METHOD} {route}` | SERVER | One per request |
| `fastify.handler` | INTERNAL | Child of server span |
| `fastify.hook.onRequest` | INTERNAL | When `hookSpans: true` |
| `fastify.hook.preParsing` | INTERNAL | When `hookSpans: true` |
| `fastify.hook.preValidation` | INTERNAL | When `hookSpans: true` |
| `fastify.hook.preHandler` | INTERNAL | When `hookSpans: true` |
| `fastify.hook.preSerialization` | INTERNAL | When `hookSpans: true` |
| `fastify.hook.onSend` | INTERNAL | When `hookSpans: true` |
| `fastify.hook.onError` | INTERNAL | When `hookSpans: true` and error occurred |

## Zero Overhead When OTel Is Not Installed

If `@opentelemetry/api` is not installed, the plugin registers no hooks and no decorators.

## License

MIT
