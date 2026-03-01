'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelHandlerSpan = Symbol('fastify.otel.handler')
const kOtelCtx = Symbol('fastify.otel.ctx')

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  // TODO(features): destructure SpanKind, SpanStatusCode, context from otel
  // TODO(features): create tracer via trace.getTracer
  // TODO(features): resolve ignoreRoutes set and spanNameFormatter
  // TODO(features): conditionally register fastify.otel decorator and request.otelSpan decorator
  // TODO(features): register onRequest hook — extract context, start SERVER span, store on request
  // TODO(features): register onResponse hook — set response attributes, error status, end SERVER span
  // TODO(features): when opts.hookSpans !== false, register paired hooks for each lifecycle phase
  // TODO(features): register preHandler hook to start handler span
  // TODO(features): register onSend hook to end handler span
  // TODO(features): register onError hook to record exceptions on handler/server span
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
module.exports.default = module.exports
