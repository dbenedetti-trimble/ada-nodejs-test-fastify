# fastify-otel

First-party OpenTelemetry instrumentation plugin for Fastify, using the native hook system.

## Features

- **Server request spans** covering the full request lifecycle (`onRequest` → `onResponse`)
- **Route handler spans** as children of server spans
- **Lifecycle hook spans** (optional, configurable via `hookSpans`)
- **HTTP semantic convention attributes** (stable, OTel v1.23.0+)
- **Error and exception recording** on spans with proper status codes
- **W3C Trace Context propagation** from incoming `traceparent`/`tracestate` headers
- **Zero overhead** when `@opentelemetry/api` is not installed (full no-op)
- **TypeScript type definitions** included

## Installation

```bash
npm install @opentelemetry/api
```

The plugin is included as part of Fastify. No separate installation needed.

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('./plugin-otel')

// Register the plugin
fastify.register(otelPlugin, {
  exposeApi: true,       // Default: true; exposes fastify.otel and request.otelSpan
  hookSpans: true,       // Default: false; creates spans for lifecycle hooks
  ignoreRoutes: [],      // Array of route URLs to exclude from instrumentation
  spanNameFormatter: null // Optional function to customize span names
})

// Define routes
fastify.get('/users/:id', async (request, reply) => {
  // Access the server span to add custom attributes
  request.otelSpan.setAttribute('user.id', request.params.id)
  
  // Create custom spans for specific operations
  const dbSpan = fastify.otel.tracer.startSpan('db.query')
  // ... perform database operation
  dbSpan.end()
  
  return { user: request.params.id }
})

fastify.listen({ port: 3000 })
```

## Configuration

### `exposeApi` (boolean, default: `true`)

Exposes the OTel API via decorators:
- `fastify.otel.tracer`: The `Tracer` instance used by the plugin
- `request.otelSpan`: The server span for the current request

### `hookSpans` (boolean, default: `false`)

Enables automatic span creation for lifecycle hook phases:
- `fastify.hook.onRequest`
- `fastify.hook.preParsing`
- `fastify.hook.preValidation`
- `fastify.hook.preHandler`
- `fastify.hook.preSerialization`
- `fastify.hook.onSend`
- `fastify.hook.onError` (only when errors occur)

### `ignoreRoutes` (array of strings, default: `[]`)

Routes matching these URL patterns will not create spans. Example:

```javascript
fastify.register(otelPlugin, {
  ignoreRoutes: ['/health', '/metrics']
})
```

### `spanNameFormatter` (function, optional)

Custom function to format span names. Receives the Fastify request object and returns a string:

```javascript
fastify.register(otelPlugin, {
  spanNameFormatter: (request) => `HTTP ${request.method}`
})
```

## Requirements

- Fastify 5.x
- Node.js 20.x or later
- `@opentelemetry/api` >= 1.4.0 (peer dependency, optional)

## OpenTelemetry SDK Setup

The plugin requires an OpenTelemetry SDK to be configured in your application. Example:

```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base')

const provider = new NodeTracerProvider()
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()))
provider.register()
```

## Span Structure

For each request, the plugin creates the following span hierarchy:

```
SERVER span: "GET /users/:id"
├─ INTERNAL span: "fastify.handler"
└─ [if hookSpans enabled]
   ├─ INTERNAL span: "fastify.hook.onRequest"
   ├─ INTERNAL span: "fastify.hook.preParsing"
   ├─ INTERNAL span: "fastify.hook.preValidation"
   ├─ INTERNAL span: "fastify.hook.preHandler"
   ├─ INTERNAL span: "fastify.hook.preSerialization"
   └─ INTERNAL span: "fastify.hook.onSend"
```

## HTTP Semantic Conventions

The plugin follows OpenTelemetry HTTP semantic conventions (stable as of v1.23.0):

**Request attributes:**
- `http.request.method`
- `url.path`
- `url.query` (if present)
- `url.scheme`
- `server.address`
- `server.port`
- `network.protocol.version`
- `user_agent.original` (if present)
- `http.request.header.content-length` (if present)

**Response attributes:**
- `http.response.status_code`
- `http.route` (parameterized route pattern, e.g., `/users/:id`)
- `http.response.header.content-length` (if present)

## Error Handling

- **Handler exceptions**: Recorded on the handler span via `recordException()`, span status set to `ERROR`
- **5xx responses**: Server span status set to `ERROR` with message `HTTP {statusCode}`
- **4xx responses**: Server span status remains `UNSET` (client errors are not server errors)

## W3C Trace Context Propagation

The plugin automatically extracts trace context from incoming request headers:
- `traceparent`: Creates server span as a child of the incoming trace
- `tracestate`: Propagates trace state values

If no trace context headers are present, the plugin starts a new trace.

## License

MIT
