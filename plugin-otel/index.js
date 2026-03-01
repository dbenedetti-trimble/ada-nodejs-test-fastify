'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelContext = Symbol('fastify.otel.context')
const kHandlerSpan = Symbol('fastify.otel.handler.span')

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const { trace, SpanKind, SpanStatusCode } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes ?? [])
  const formatSpanName = opts.spanNameFormatter ?? defaultSpanName
  const hookSpans = opts.hookSpans !== false

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  // --- Core lifecycle hooks ---

  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    if (ignoreRoutes.has(request.routeOptions && request.routeOptions.url)) {
      return done()
    }
    const parentContext = extractContext(otel, request.headers)
    const addr = fastify.server.address()
    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request, addr && addr.port) },
      parentContext
    )
    const ctx = trace.setSpan(parentContext, span)
    request[kOtelSpan] = span
    request[kOtelContext] = ctx
    if (opts.exposeApi !== false) {
      request.otelSpan = span
    }
    otel.context.with(ctx, done)
  })

  fastify.addHook('preHandler', function preHandlerOtel (request, reply, done) {
    const serverSpan = request[kOtelSpan]
    if (!serverSpan) return done()
    const ctx = request[kOtelContext]
    const handlerSpan = tracer.startSpan('fastify.handler', { kind: SpanKind.INTERNAL }, ctx)
    request[kHandlerSpan] = handlerSpan
    done()
  })

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.end()
      request[kHandlerSpan] = undefined
    }
    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    } else {
      const serverSpan = request[kOtelSpan]
      if (serverSpan) {
        serverSpan.recordException(error)
      }
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

  // --- Hook span instrumentation (hookSpans: true) ---

  if (hookSpans) {
    function createHookSpan (request, name) {
      const serverSpan = request[kOtelSpan]
      if (!serverSpan) return null
      const ctx = request[kOtelContext]
      return tracer.startSpan(name, { kind: SpanKind.INTERNAL }, ctx)
    }

    fastify.addHook('onRequest', function onRequestHookSpan (request, reply, done) {
      const span = createHookSpan(request, 'fastify.hook.onRequest')
      if (span) span.end()
      done()
    })

    fastify.addHook('preParsing', function preParsingHookSpan (request, reply, payload, done) {
      const span = createHookSpan(request, 'fastify.hook.preParsing')
      if (span) span.end()
      done(null, payload)
    })

    fastify.addHook('preValidation', function preValidationHookSpan (request, reply, done) {
      const span = createHookSpan(request, 'fastify.hook.preValidation')
      if (span) span.end()
      done()
    })

    fastify.addHook('preHandler', function preHandlerHookSpan (request, reply, done) {
      const span = createHookSpan(request, 'fastify.hook.preHandler')
      if (span) span.end()
      done()
    })

    fastify.addHook('preSerialization', function preSerializationHookSpan (request, reply, payload, done) {
      const span = createHookSpan(request, 'fastify.hook.preSerialization')
      if (span) span.end()
      done(null, payload)
    })

    fastify.addHook('onSend', function onSendHookSpan (request, reply, payload, done) {
      const span = createHookSpan(request, 'fastify.hook.onSend')
      if (span) span.end()
      done(null, payload)
    })

    fastify.addHook('onError', function onErrorHookSpan (request, reply, error, done) {
      const serverSpan = request[kOtelSpan]
      if (serverSpan) {
        const ctx = request[kOtelContext]
        const span = tracer.startSpan('fastify.hook.onError', { kind: SpanKind.INTERNAL }, ctx)
        span.recordException(error)
        span.end()
      }
      done()
    })
  }
}

function defaultSpanName (request) {
  const route = request.routeOptions && request.routeOptions.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
