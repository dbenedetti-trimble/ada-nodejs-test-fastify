'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelHandlerSpan = Symbol('fastify.otel.handler')
const kOtelCtx = Symbol('fastify.otel.ctx')
const kOtelHookSpan = Symbol('fastify.otel.hookspan')

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const { trace, context, SpanKind, SpanStatusCode } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes ?? [])
  const hookSpans = opts.hookSpans !== false
  const formatSpanName = opts.spanNameFormatter ?? defaultSpanName

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  // onRequest: extract W3C context, start SERVER span, activate context for full request lifecycle
  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    if (ignoreRoutes.has(request.routeOptions?.url)) return done()

    const parentCtx = extractContext(otel, request.headers)
    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request) },
      parentCtx
    )
    const spanCtx = trace.setSpan(parentCtx, span)

    request[kOtelSpan] = span
    request[kOtelCtx] = spanCtx
    if (opts.exposeApi !== false) request.otelSpan = span

    if (hookSpans) {
      const hookSpan = tracer.startSpan('fastify.hook.onRequest', { kind: SpanKind.INTERNAL }, spanCtx)
      request[kOtelHookSpan] = hookSpan
    }

    // Activate the context so all subsequent hooks and handler inherit the OTel context
    context.with(spanCtx, done)
  })

  // Hook phase spans use the "next phase as endpoint" strategy:
  // each phase span starts when its hook fires and ends when the next phase hook fires.
  if (hookSpans) {
    fastify.addHook('preParsing', function preParsingOtel (request, reply, payload, done) {
      const prev = request[kOtelHookSpan]
      if (prev) prev.end()
      if (request[kOtelSpan]) {
        request[kOtelHookSpan] = tracer.startSpan('fastify.hook.preParsing', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
      }
      done(null, payload)
    })

    fastify.addHook('preValidation', function preValidationOtel (request, reply, done) {
      const prev = request[kOtelHookSpan]
      if (prev) prev.end()
      if (request[kOtelSpan]) {
        request[kOtelHookSpan] = tracer.startSpan('fastify.hook.preValidation', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
      }
      done()
    })

    fastify.addHook('preHandler', function preHandlerHookSpanOtel (request, reply, done) {
      const prev = request[kOtelHookSpan]
      if (prev) prev.end()
      if (request[kOtelSpan]) {
        request[kOtelHookSpan] = tracer.startSpan('fastify.hook.preHandler', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
      }
      done()
    })
  }

  // Handler span: starts in preHandler (after hook span transition), ends in onSend
  fastify.addHook('preHandler', function preHandlerHandlerSpanOtel (request, reply, done) {
    if (!request[kOtelSpan]) return done()
    request[kOtelHandlerSpan] = tracer.startSpan('fastify.handler', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
    done()
  })

  if (hookSpans) {
    fastify.addHook('preSerialization', function preSerializationOtel (request, reply, payload, done) {
      const prev = request[kOtelHookSpan]
      if (prev) prev.end()
      if (request[kOtelSpan]) {
        request[kOtelHookSpan] = tracer.startSpan('fastify.hook.preSerialization', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
      }
      done(null, payload)
    })
  }

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    const handlerSpan = request[kOtelHandlerSpan]
    if (handlerSpan) handlerSpan.end()

    if (hookSpans) {
      const prev = request[kOtelHookSpan]
      if (prev) prev.end()
      if (request[kOtelSpan]) {
        request[kOtelHookSpan] = tracer.startSpan('fastify.hook.onSend', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
      }
    }

    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kOtelHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    } else {
      const serverSpan = request[kOtelSpan]
      if (serverSpan) serverSpan.recordException(error)
    }

    if (hookSpans && request[kOtelSpan]) {
      const prev = request[kOtelHookSpan]
      if (prev) prev.end()
      const onErrSpan = tracer.startSpan('fastify.hook.onError', { kind: SpanKind.INTERNAL }, request[kOtelCtx])
      onErrSpan.recordException(error)
      onErrSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      onErrSpan.end()
      request[kOtelHookSpan] = null
    }

    done()
  })

  fastify.addHook('onResponse', function onResponseOtel (request, reply, done) {
    const span = request[kOtelSpan]
    if (!span) return done()

    const hookSpan = request[kOtelHookSpan]
    if (hookSpan) hookSpan.end()

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
module.exports.default = module.exports
