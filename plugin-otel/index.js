'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelContext = Symbol('fastify.otel.context')
const kOtelHandlerSpan = Symbol('fastify.otel.handlerSpan')

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const { trace, context, SpanKind, SpanStatusCode } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes ?? [])
  const formatSpanName = opts.spanNameFormatter ?? defaultSpanName

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    if (ignoreRoutes.has(request.routeOptions?.url)) return done()
    const parentContext = extractContext(otel, request.headers)
    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request) },
      parentContext
    )
    const spanContext = trace.setSpan(parentContext, span)
    request[kOtelSpan] = span
    request[kOtelContext] = spanContext
    if (opts.exposeApi !== false) request.otelSpan = span
    done()
  })

  fastify.addHook('preHandler', function preHandlerOtelCtx (request, reply, done) {
    const spanCtx = request[kOtelContext]
    if (!spanCtx) return done()
    const handlerSpan = tracer.startSpan('fastify.handler', {}, spanCtx)
    request[kOtelHandlerSpan] = handlerSpan
    context.with(spanCtx, done)
  })

  fastify.addHook('onSend', function onSendOtelHandler (request, reply, payload, done) {
    const span = request[kOtelHandlerSpan]
    if (span) {
      request[kOtelHandlerSpan] = null
      span.end()
    }
    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtelHandler (request, reply, error, done) {
    const span = request[kOtelHandlerSpan]
    if (span) {
      span.recordException(error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    }
    done()
  })

  fastify.addHook('onResponse', function onResponseOtel (request, reply, done) {
    const span = request[kOtelSpan]
    if (!span) return done()
    span.setAttributes(buildResponseAttributes(request, reply))
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP ' + reply.statusCode })
    }
    span.end()
    done()
  })
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
