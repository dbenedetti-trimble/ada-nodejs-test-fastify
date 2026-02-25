'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kServerSpan = Symbol('fastify.otel.serverSpan')
const kHandlerSpan = Symbol('fastify.otel.handlerSpan')
const kHookSpan = Symbol('fastify.otel.hookSpan')

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
  const enableHookSpans = opts.hookSpans !== false

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    if (ignoreRoutes.has(request.routeOptions?.url)) return done()

    const parentContext = extractContext(otel, request.headers)
    const serverSpan = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request) },
      parentContext
    )
    request[kServerSpan] = serverSpan
    if (opts.exposeApi !== false) request.otelSpan = serverSpan

    if (enableHookSpans) {
      const ctx = trace.setSpan(parentContext, serverSpan)
      request[kHookSpan] = tracer.startSpan('fastify.hook.onRequest', {}, ctx)
    }

    const spanContext = trace.setSpan(parentContext, serverSpan)
    context.with(spanContext, done)
  })

  if (enableHookSpans) {
    fastify.addHook('preParsing', function preParsingOtel (request, reply, payload, done) {
      if (!request[kServerSpan]) return done(null, payload)
      endHookSpan(request)
      startHookSpan(request, 'fastify.hook.preParsing', tracer, trace, context)
      done(null, payload)
    })

    fastify.addHook('preValidation', function preValidationOtel (request, reply, done) {
      if (!request[kServerSpan]) return done()
      endHookSpan(request)
      startHookSpan(request, 'fastify.hook.preValidation', tracer, trace, context)
      done()
    })
  }

  fastify.addHook('preHandler', function preHandlerOtel (request, reply, done) {
    const serverSpan = request[kServerSpan]
    if (!serverSpan) return done()

    if (enableHookSpans) {
      endHookSpan(request)
      startHookSpan(request, 'fastify.hook.preHandler', tracer, trace, context)
    }

    const ctx = trace.setSpan(context.active(), serverSpan)
    request[kHandlerSpan] = tracer.startSpan('fastify.handler', {}, ctx)
    done()
  })

  if (enableHookSpans) {
    fastify.addHook('preSerialization', function preSerializationOtel (request, reply, payload, done) {
      if (!request[kServerSpan]) return done(null, payload)
      endHookSpan(request)
      startHookSpan(request, 'fastify.hook.preSerialization', tracer, trace, context)
      done(null, payload)
    })
  }

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    if (enableHookSpans && request[kServerSpan]) {
      endHookSpan(request)
      startHookSpan(request, 'fastify.hook.onSend', tracer, trace, context)
    }

    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.end()
      request[kHandlerSpan] = null
    }
    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    }

    const serverSpan = request[kServerSpan]
    if (serverSpan) {
      serverSpan.recordException(error)
    }

    if (enableHookSpans && serverSpan) {
      const ctx = trace.setSpan(context.active(), serverSpan)
      const errorSpan = tracer.startSpan('fastify.hook.onError', {}, ctx)
      errorSpan.recordException(error)
      errorSpan.end()
    }

    done()
  })

  fastify.addHook('onResponse', function onResponseOtel (request, reply, done) {
    if (enableHookSpans) {
      endHookSpan(request)
    }

    const serverSpan = request[kServerSpan]
    if (!serverSpan) return done()

    serverSpan.setAttributes(buildResponseAttributes(request, reply))
    if (reply.statusCode >= 500) {
      serverSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP ' + reply.statusCode })
    }
    serverSpan.end()
    done()
  })

  function endHookSpan (request) {
    const span = request[kHookSpan]
    if (span) {
      span.end()
      request[kHookSpan] = null
    }
  }

  function startHookSpan (request, name, tracer, trace, context) {
    const serverSpan = request[kServerSpan]
    if (!serverSpan) return
    const ctx = trace.setSpan(context.active(), serverSpan)
    request[kHookSpan] = tracer.startSpan(name, {}, ctx)
  }
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
