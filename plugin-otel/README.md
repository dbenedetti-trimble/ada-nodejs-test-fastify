# fastify-otel

Native OpenTelemetry instrumentation plugin for Fastify. Provides automatic distributed tracing using Fastify's hook system rather than external monkey-patching.

## Features

- Server request span covering the full request lifecycle
- Route handler span as a child of the server span
- Configurable lifecycle hook spans for each Fastify hook phase
- HTTP semantic convention attributes (stable v1.23.0)
- Error and exception recording on spans
- W3C Trace Context propagation (`traceparent`/`tracestate`)
- Zero overhead when `@opentelemetry/api` is not installed
- TypeScript type definitions

## Install

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node
```

`@opentelemetry/api` is an optional peer dependency. When it is not installed, the plugin is a complete no-op with zero overhead.

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('./plugin-otel')

fastify.register(otelPlugin, {
  exposeApi: true,        // expose fastify.otel and request.otelSpan (default: true)
  hookSpans: true,        // create spans for each hook phase (default: true)
  ignoreRoutes: ['/health'], // routes to exclude from instrumentation
  spanNameFormatter: null  // custom function(request) => string
})

fastify.get('/users/:id', async (request, reply) => {
  // Access the server span to add custom attributes
  request.otelSpan.setAttribute('user.id', request.params.id)

  // Create child spans using the tracer
  const span = fastify.otel.tracer.startSpan('db.query')
  // ... do work ...
  span.end()

  return { id: request.params.id }
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exposeApi` | `boolean` | `true` | Register `fastify.otel` and `request.otelSpan` decorators |
| `hookSpans` | `boolean` | `true` | Create child spans for each Fastify lifecycle hook phase |
| `ignoreRoutes` | `string[]` | `[]` | Route patterns to exclude from instrumentation |
| `spanNameFormatter` | `function` | `null` | Custom function `(request) => string` for span names |

## Span Structure

For each instrumented request:

```
GET /users/:id (SERVER span)
├── fastify.hook.onRequest
├── fastify.hook.preParsing
├── fastify.hook.preValidation
├── fastify.hook.preHandler
├── fastify.handler
├── fastify.hook.preSerialization
└── fastify.hook.onSend
```

Hook phase spans are only created when `hookSpans: true`.

## HTTP Semantic Conventions

The server span carries attributes following OpenTelemetry HTTP semantic conventions (stable v1.23.0):

- `http.request.method`, `url.path`, `url.query`, `url.scheme`
- `server.address`, `server.port`, `network.protocol.version`
- `user_agent.original`, `http.request.header.content-length`
- `http.response.status_code`, `http.route`, `http.response.header.content-length`

## License

MIT
