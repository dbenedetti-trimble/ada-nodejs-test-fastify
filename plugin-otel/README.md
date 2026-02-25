# Fastify OpenTelemetry Plugin

OpenTelemetry instrumentation plugin for Fastify with zero-overhead no-op behavior when OTel is not installed.

## Installation

```bash
npm install @fastify/otel @opentelemetry/api
```

## Usage

```javascript
const fastify = require('fastify')()
const otelPlugin = require('@fastify/otel')

await fastify.register(otelPlugin, {
  exposeApi: true,
  hookSpans: true,
  ignoreRoutes: ['/health', /^\/metrics/],
  spanNameFormatter: null
})
```

## Options

- `exposeApi` (boolean, default: true) - Expose tracer via `fastify.otel` decorator
- `hookSpans` (boolean, default: true) - Create spans for lifecycle hooks
- `ignoreRoutes` (array, default: []) - Routes to exclude from instrumentation (strings or RegExp)
- `spanNameFormatter` (function, default: null) - Custom span name formatter

## Features

- Zero-overhead when `@opentelemetry/api` is not installed
- Server span for each request
- W3C Trace Context propagation
- HTTP semantic conventions
- Optional hook spans
- Route filtering

## Requirements

- Fastify 5.x
- Node.js 20.x or later
- `@opentelemetry/api` (optional peer dependency)
