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

  const { trace, context, SpanKind, SpanStatusCode } = otel
  const tracer = trace.getTracer('fastify', fastify.version)
  const ignoreRoutes = new Set(opts.ignoreRoutes ?? [])
  const formatSpanName = opts.spanNameFormatter ?? defaultSpanName
  const useHookSpans = opts.hookSpans !== false

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
    request[kOtelSpan] = span
    if (opts.exposeApi !== false) request.otelSpan = span

    const serverCtx = trace.setSpan(parentContext, span)
    context.with(serverCtx, () => {
      if (useHookSpans) {
        const hookSpan = tracer.startSpan('fastify.hook.onRequest', {}, context.active())
        hookSpan.end()
      }
      done()
    })
  })

  if (useHookSpans) {
    fastify.addHook('preParsing', function preParsingOtel (request, reply, payload, done) {
      if (!request[kOtelSpan]) return done(null, payload)
      const hookSpan = tracer.startSpan('fastify.hook.preParsing', {}, context.active())
      hookSpan.end()
      done(null, payload)
    })

    fastify.addHook('preValidation', function preValidationOtel (request, reply, done) {
      if (!request[kOtelSpan]) return done()
      const hookSpan = tracer.startSpan('fastify.hook.preValidation', {}, context.active())
      hookSpan.end()
      done()
    })
  }

  fastify.addHook('preHandler', function preHandlerOtel (request, reply, done) {
    const serverSpan = request[kOtelSpan]
    if (!serverSpan) return done()
    const handlerSpan = tracer.startSpan('fastify.handler', {}, context.active())
    request[kHandlerSpan] = handlerSpan
    if (useHookSpans) {
      const hookSpan = tracer.startSpan('fastify.hook.preHandler', {}, context.active())
      hookSpan.end()
    }
    done()
  })

  if (useHookSpans) {
    fastify.addHook('preSerialization', function preSerializationOtel (request, reply, payload, done) {
      if (!request[kOtelSpan]) return done(null, payload)
      const hookSpan = tracer.startSpan('fastify.hook.preSerialization', {}, context.active())
      hookSpan.end()
      done(null, payload)
    })
  }

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.end()
      request[kHandlerSpan] = null
    }
    if (useHookSpans && request[kOtelSpan]) {
      const hookSpan = tracer.startSpan('fastify.hook.onSend', {}, context.active())
      hookSpan.end()
    }
    done(null, payload)
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

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      handlerSpan.end()
      request[kHandlerSpan] = null
    }
    if (useHookSpans && request[kOtelSpan]) {
      const hookSpan = tracer.startSpan('fastify.hook.onError', {}, context.active())
      hookSpan.end()
    }
    done()
  })
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
module.exports.default = module.exports
module.exports.otelPlugin = otelPlugin
