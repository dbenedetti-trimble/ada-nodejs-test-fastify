# fastify-otel

First-party OpenTelemetry instrumentation plugin for Fastify. Uses Fastify's hook system to produce distributed traces with zero overhead when the OTel SDK is absent.

## Install

```bash
npm install fastify-otel
```

The plugin requires `@opentelemetry/api` as a peer dependency. Install it alongside your OTel SDK:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('fastify-otel')

fastify.register(otelPlugin, {
  exposeApi: true,       // default: true — register fastify.otel and request.otelSpan
  hookSpans: true,       // default: true — create child spans for lifecycle hook phases
  ignoreRoutes: ['/health'],
  spanNameFormatter: null // default: "{METHOD} {route}" e.g. "GET /users/:id"
})
```

## Decorator API

When `exposeApi` is `true`:

- `fastify.otel.tracer` — the OTel `Tracer` instance
- `request.otelSpan` — the server span for the current request

## Behavior when OTel is absent

If `@opentelemetry/api` is not installed, the plugin is a complete no-op: no hooks are registered, no decorators are added, and there is zero runtime overhead.
