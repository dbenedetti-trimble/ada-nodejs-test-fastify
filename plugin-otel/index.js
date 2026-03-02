'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kHandlerSpan = Symbol('fastify.otel.handler-span')

const HOOK_PHASES = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend',
  'onError'
]

async function otelPlugin (fastify, opts) {
  const otel = loadOtelApi()
  if (!otel) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const { trace, SpanKind, SpanStatusCode, context: otelContext } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes ?? [])
  const formatSpanName = opts.spanNameFormatter ?? defaultSpanName
  const hookSpans = opts.hookSpans !== false

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
    request._otelContext = spanContext
    if (opts.exposeApi !== false) request.otelSpan = span
    otelContext.with(spanContext, () => done())
  })

  fastify.addHook('preHandler', function preHandlerOtel (request, reply, done) {
    const serverSpan = request[kOtelSpan]
    if (!serverSpan) return done()
    const parentCtx = request._otelContext
    const handlerSpan = tracer.startSpan('fastify.handler', {}, parentCtx)
    request[kHandlerSpan] = handlerSpan
    done()
  })

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.end()
    }
    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      request._otelHandlerErrorRecorded = true
    }
    const serverSpan = request[kOtelSpan]
    if (serverSpan && !handlerSpan) {
      serverSpan.recordException(error)
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

  if (hookSpans) {
    registerHookSpans(fastify, tracer, HOOK_PHASES)
  }
}

// Hook spans mark that a lifecycle phase executed. Due to Fastify's hook API,
// each plugin hook runs alongside other hooks in the same phase, so these spans
// reflect phase participation rather than total phase duration.
function registerHookSpans (fastify, tracer, phases) {
  for (const hookName of phases) {
    if (hookName === 'onError') {
      fastify.addHook('onError', function hookSpanOnError (request, reply, error, done) {
        const serverSpan = request[kOtelSpan]
        if (!serverSpan) return done()
        const parentCtx = request._otelContext
        const span = tracer.startSpan('fastify.hook.onError', {}, parentCtx)
        span.recordException(error)
        span.end()
        done()
      })
    } else if (hookName === 'preParsing') {
      fastify.addHook('preParsing', function hookSpanPreParsing (request, reply, payload, done) {
        const serverSpan = request[kOtelSpan]
        if (!serverSpan) return done(null, payload)
        const parentCtx = request._otelContext
        const span = tracer.startSpan('fastify.hook.preParsing', {}, parentCtx)
        span.end()
        done(null, payload)
      })
    } else if (hookName === 'preSerialization') {
      fastify.addHook('preSerialization', function hookSpanPreSerialization (request, reply, payload, done) {
        const serverSpan = request[kOtelSpan]
        if (!serverSpan) return done(null, payload)
        const parentCtx = request._otelContext
        const span = tracer.startSpan('fastify.hook.preSerialization', {}, parentCtx)
        span.end()
        done(null, payload)
      })
    } else if (hookName === 'onSend') {
      fastify.addHook('onSend', function hookSpanOnSend (request, reply, payload, done) {
        const serverSpan = request[kOtelSpan]
        if (!serverSpan) return done(null, payload)
        const parentCtx = request._otelContext
        const span = tracer.startSpan('fastify.hook.onSend', {}, parentCtx)
        span.end()
        done(null, payload)
      })
    } else {
      fastify.addHook(hookName, function hookSpanGeneric (request, reply, done) {
        const serverSpan = request[kOtelSpan]
        if (!serverSpan) return done()
        const parentCtx = request._otelContext
        const span = tracer.startSpan('fastify.hook.' + hookName, {}, parentCtx)
        span.end()
        done()
      })
    }
  }
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
