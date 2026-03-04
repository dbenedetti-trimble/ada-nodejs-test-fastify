'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kHandlerSpan = Symbol('fastify.otel.handlerSpan')
const kHookSpans = Symbol('fastify.otel.hookSpans')
const kOtelContext = Symbol('fastify.otel.context')

const HOOK_PHASES = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend'
]

async function otelPlugin (fastify, opts) {
  if (opts.ignoreRoutes !== undefined && !Array.isArray(opts.ignoreRoutes)) {
    throw new TypeError('ignoreRoutes must be an array of strings')
  }
  if (opts.spanNameFormatter !== undefined && opts.spanNameFormatter !== null && typeof opts.spanNameFormatter !== 'function') {
    throw new TypeError('spanNameFormatter must be a function')
  }

  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const { trace, SpanKind, SpanStatusCode, context } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes || [])
  const formatSpanName = opts.spanNameFormatter || defaultSpanName
  const hookSpansEnabled = opts.hookSpans !== false

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    const routeUrl = request.routeOptions?.url
    if (ignoreRoutes.has(routeUrl) || ignoreRoutes.has(request.url)) {
      return done()
    }

    const parentContext = extractContext(otel, request.headers)

    const serverPort = request.socket && request.socket.localPort
    const requestAttrs = buildRequestAttributes(request)
    if (serverPort) {
      requestAttrs['server.port'] = serverPort
    }

    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: requestAttrs },
      parentContext
    )

    const spanContext = trace.setSpan(parentContext, span)
    request[kOtelSpan] = span
    request[kOtelContext] = spanContext
    if (opts.exposeApi !== false) {
      request.otelSpan = span
    }

    if (hookSpansEnabled) {
      request[kHookSpans] = {}
    }

    context.with(spanContext, done)
  })

  if (hookSpansEnabled) {
    for (const phase of HOOK_PHASES) {
      registerHookSpan(fastify, phase, tracer, otel)
    }

    fastify.addHook('onError', function onErrorHookSpan (request, reply, error, done) {
      const serverSpan = request[kOtelSpan]
      if (!serverSpan) return done()

      const ctx = request[kOtelContext] || trace.setSpan(context.active(), serverSpan)
      const hookSpan = tracer.startSpan('fastify.hook.onError', {}, ctx)
      hookSpan.recordException(error)
      hookSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      hookSpan.end()
      done()
    })
  }

  fastify.addHook('preHandler', function preHandlerOtel (request, reply, done) {
    const serverSpan = request[kOtelSpan]
    if (!serverSpan) return done()

    if (hookSpansEnabled) {
      endPreviousHookSpan(request)
    }

    const ctx = request[kOtelContext] || trace.setSpan(context.active(), serverSpan)
    const handlerSpan = tracer.startSpan('fastify.handler', {}, ctx)
    request[kHandlerSpan] = handlerSpan
    done()
  })

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    }
    done()
  })

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.end()
    }
    done(null, payload)
  })

  fastify.addHook('onResponse', function onResponseOtel (request, reply, done) {
    const span = request[kOtelSpan]
    if (!span) return done()

    if (hookSpansEnabled) {
      endPreviousHookSpan(request)
    }

    span.setAttributes(buildResponseAttributes(request, reply))
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP ' + reply.statusCode })
    }
    span.end()
    done()
  })
}

function endPreviousHookSpan (request) {
  const hookSpans = request[kHookSpans]
  if (hookSpans && hookSpans._active) {
    hookSpans._active.end()
    hookSpans._active = null
  }
}

function registerHookSpan (fastify, phase, tracer, otel) {
  fastify.addHook(phase, function hookSpanWrap (request, reply, doneOrPayload, maybeDone) {
    const serverSpan = request[kOtelSpan]
    const hookSpans = request[kHookSpans]
    if (!serverSpan || !hookSpans) {
      if (typeof doneOrPayload === 'function') return doneOrPayload()
      if (typeof maybeDone === 'function') return maybeDone(null, doneOrPayload)
      return
    }

    endPreviousHookSpan(request)

    const ctx = request[kOtelContext] || otel.trace.setSpan(otel.context.active(), serverSpan)
    const hookSpan = tracer.startSpan('fastify.hook.' + phase, {}, ctx)
    hookSpans[phase] = hookSpan
    hookSpans._active = hookSpan

    if (typeof maybeDone === 'function') {
      maybeDone(null, doneOrPayload)
    } else if (typeof doneOrPayload === 'function') {
      doneOrPayload()
    }
  })
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
