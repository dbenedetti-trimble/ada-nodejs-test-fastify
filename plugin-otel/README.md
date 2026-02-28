# fastify-otel

OpenTelemetry instrumentation plugin for Fastify 5.x.

Instruments the full request lifecycle using Fastify's hook system. Produces server spans, route handler spans, and optional lifecycle hook spans following the stable OTel HTTP semantic conventions (v1.23.0+).

## Installation

```bash
npm install fastify-otel @opentelemetry/api
```

Bring your own OTel SDK and exporter:

```bash
npm install @opentelemetry/sdk-trace-node
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('fastify-otel')

fastify.register(otelPlugin, {
  exposeApi: true,
  hookSpans: true,
  ignoreRoutes: ['/health'],
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exposeApi` | `boolean` | `true` | Register `fastify.otel` and `request.otelSpan` decorators |
| `hookSpans` | `boolean` | `true` | Create child spans per lifecycle hook phase |
| `ignoreRoutes` | `string[]` | `[]` | Route URL patterns to exclude from instrumentation |
| `spanNameFormatter` | `(req) => string` | `null` | Override default `{METHOD} {route}` span naming |

## Zero overhead when OTel is not installed

When `@opentelemetry/api` is not installed, the plugin registers as a no-op: no hooks, no decorators, no overhead.

## TypeScript

Full type definitions are included. Augments `FastifyInstance` and `FastifyRequest`.

## License

MIT
