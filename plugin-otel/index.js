'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelContext = Symbol('fastify.otel.context')
const kHandlerSpan = Symbol('fastify.otel.handler.span')
const kCurrentHookSpan = Symbol('fastify.otel.current.hook.span')

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
    if (request.routeOptions && ignoreRoutes.has(request.routeOptions.url)) {
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
    const activeHookSpan = request[kCurrentHookSpan]
    if (activeHookSpan) {
      activeHookSpan.end()
      request[kCurrentHookSpan] = undefined
    }
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
    const activeHookSpan = request[kCurrentHookSpan]
    if (activeHookSpan) {
      activeHookSpan.end()
      request[kCurrentHookSpan] = undefined
    }
    span.setAttributes(buildResponseAttributes(request, reply))
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP ' + reply.statusCode })
    }
    span.end()
    done()
  })

  // --- Hook span instrumentation (hookSpans: true) ---

  if (hookSpans) {
    // Ends the current phase span and starts a new one for the given phase.
    // Called at the START of each plugin hook so user hooks in that phase run after span start,
    // and the previous phase's span captures the duration of all user hooks from that phase.
    function transitionHookSpan (request, name) {
      if (!request[kOtelSpan]) return
      const prev = request[kCurrentHookSpan]
      if (prev) prev.end()
      const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL }, request[kOtelContext])
      request[kCurrentHookSpan] = span
    }

    // Start onRequest hook span (runs after core onRequest hook which creates server span)
    fastify.addHook('onRequest', function onRequestHookSpan (request, reply, done) {
      if (request[kOtelSpan]) {
        const span = tracer.startSpan('fastify.hook.onRequest', { kind: SpanKind.INTERNAL }, request[kOtelContext])
        request[kCurrentHookSpan] = span
      }
      done()
    })

    // Transition: ends onRequest span (capturing all user onRequest hooks), starts preParsing span
    fastify.addHook('preParsing', function preParsingHookSpan (request, reply, payload, done) {
      transitionHookSpan(request, 'fastify.hook.preParsing')
      done(null, payload)
    })

    // Transition: ends preParsing span, starts preValidation span
    fastify.addHook('preValidation', function preValidationHookSpan (request, reply, done) {
      transitionHookSpan(request, 'fastify.hook.preValidation')
      done()
    })

    // Transition: ends preValidation span, starts preHandler span
    // Note: core preHandler hook (handler span creation) runs before this hook
    fastify.addHook('preHandler', function preHandlerHookSpan (request, reply, done) {
      transitionHookSpan(request, 'fastify.hook.preHandler')
      done()
    })

    // Transition: ends preHandler span (covers user preHandler hooks + handler execution),
    // starts preSerialization span. This documented trade-off is unavoidable without core changes.
    fastify.addHook('preSerialization', function preSerializationHookSpan (request, reply, payload, done) {
      transitionHookSpan(request, 'fastify.hook.preSerialization')
      done(null, payload)
    })

    // Transition: ends preSerialization span, starts onSend span
    // Note: core onSend hook (handler span end) runs before this hook
    fastify.addHook('onSend', function onSendHookSpan (request, reply, payload, done) {
      transitionHookSpan(request, 'fastify.hook.onSend')
      done(null, payload)
    })

    // onError: create a dedicated error hook span; active hook span already cleaned up by core onError hook
    fastify.addHook('onError', function onErrorHookSpan (request, reply, error, done) {
      if (request[kOtelSpan]) {
        const span = tracer.startSpan('fastify.hook.onError', { kind: SpanKind.INTERNAL }, request[kOtelContext])
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
