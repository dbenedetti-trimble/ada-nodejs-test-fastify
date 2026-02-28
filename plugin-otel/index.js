'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kHandlerSpan = Symbol('fastify.otel.handler-span')

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  // TODO(features): destructure SpanKind, SpanStatusCode, context, trace from otel
  // TODO(features): create tracer via trace.getTracer('fastify', fastify.version)
  // TODO(features): build ignoreRoutes Set from opts.ignoreRoutes
  // TODO(features): resolve spanNameFormatter from opts.spanNameFormatter

  // TODO(features): conditionally register fastify.otel decorator and request.otelSpan decorator

  // TODO(features): register onRequest hook — extract context, start server span
  // TODO(features): register onResponse hook — set response attributes, end server span
  // TODO(features): register preHandler hook — start handler span
  // TODO(features): register onSend hook — end handler span
  // TODO(features): register onError hook — record exception, end handler span with error
  // TODO(features): if hookSpans: true, register paired hooks for all lifecycle phases
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
module.exports.default = module.exports
module.exports.otelPlugin = otelPlugin
