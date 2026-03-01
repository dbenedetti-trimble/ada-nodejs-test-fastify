'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
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
  const hookSpans = opts.hookSpans !== false

  function startChildSpan (parentSpan, name) {
    const ctx = trace.setSpan(context.active(), parentSpan)
    return tracer.startSpan(name, {}, ctx)
  }

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
  }

  fastify.addHook('onRequest', function onRequestOtel (request, reply, done) {
    const routeUrl = request.routeOptions?.url
    if (routeUrl !== undefined && ignoreRoutes.has(routeUrl)) return done()

    const parentContext = extractContext(otel, request.headers)
    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request) },
      parentContext
    )
    request[kOtelSpan] = span
    if (opts.exposeApi !== false) request.otelSpan = span

    const activeCtx = trace.setSpan(parentContext, span)

    if (hookSpans) {
      request[kHookSpan] = tracer.startSpan('fastify.hook.onRequest', {}, activeCtx)
    }

    context.with(activeCtx, done)
  })

  fastify.addHook('preParsing', function preParsingOtel (request, reply, payload, done) {
    if (!request[kOtelSpan]) return done(null, payload)
    if (hookSpans) {
      endSpan(request[kHookSpan])
      request[kHookSpan] = startChildSpan(request[kOtelSpan], 'fastify.hook.preParsing')
    }
    done(null, payload)
  })

  fastify.addHook('preValidation', function preValidationOtel (request, reply, done) {
    if (!request[kOtelSpan]) return done()
    if (hookSpans) {
      endSpan(request[kHookSpan])
      request[kHookSpan] = startChildSpan(request[kOtelSpan], 'fastify.hook.preValidation')
    }
    done()
  })

  fastify.addHook('preHandler', function preHandlerOtel (request, reply, done) {
    if (!request[kOtelSpan]) return done()
    if (hookSpans) {
      endSpan(request[kHookSpan])
      request[kHookSpan] = startChildSpan(request[kOtelSpan], 'fastify.hook.preHandler')
    }
    request[kHandlerSpan] = startChildSpan(request[kOtelSpan], 'fastify.handler')
    done()
  })

  fastify.addHook('preSerialization', function preSerializationOtel (request, reply, payload, done) {
    if (!request[kOtelSpan]) return done(null, payload)
    if (hookSpans) {
      endSpan(request[kHookSpan])
      request[kHookSpan] = startChildSpan(request[kOtelSpan], 'fastify.hook.preSerialization')
    }
    done(null, payload)
  })

  fastify.addHook('onSend', function onSendOtel (request, reply, payload, done) {
    if (!request[kOtelSpan]) return done(null, payload)
    if (hookSpans) {
      endSpan(request[kHookSpan])
      request[kHookSpan] = startChildSpan(request[kOtelSpan], 'fastify.hook.onSend')
    }
    endSpan(request[kHandlerSpan])
    request[kHandlerSpan] = null
    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtel (request, reply, error, done) {
    const handlerSpan = request[kHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      endSpan(handlerSpan)
      request[kHandlerSpan] = null
    }
    if (hookSpans) {
      endSpan(request[kHookSpan])
      const serverSpan = request[kOtelSpan]
      if (serverSpan) {
        request[kHookSpan] = startChildSpan(serverSpan, 'fastify.hook.onError')
      }
    }
    done()
  })

  fastify.addHook('onResponse', function onResponseOtel (request, reply, done) {
    const span = request[kOtelSpan]
    if (!span) return done()

    if (hookSpans) {
      endSpan(request[kHookSpan])
      request[kHookSpan] = null
    }

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

function endSpan (span) {
  if (span) span.end()
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
