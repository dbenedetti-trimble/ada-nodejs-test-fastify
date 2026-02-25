'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelHandlerSpan = Symbol('fastify.otel.handler.span')
const kOtelHookSpans = Symbol('fastify.otel.hook.spans')

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
  const hasContextAPI = context && typeof context.active === 'function' && typeof trace.setSpan === 'function'
  const enableHookSpans = opts.hookSpans === true

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', undefined)
  }

  fastify.addHook('onRoute', function onRouteOtel (routeOptions) {
    if (ignoreRoutes.has(routeOptions.url)) return

    const originalHandler = routeOptions.handler

    routeOptions.handler = function wrappedHandler (request, reply) {
      const serverSpan = request[kOtelSpan]
      if (!serverSpan) {
        return originalHandler.call(this, request, reply)
      }

      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const handlerSpan = tracer.startSpan(
        'fastify.handler',
        { kind: SpanKind.INTERNAL },
        activeContext
      )
      request[kOtelHandlerSpan] = handlerSpan

      try {
        const result = originalHandler.call(this, request, reply)

        if (result && typeof result.then === 'function') {
          return result.then(
            (value) => {
              handlerSpan.end()
              return value
            },
            (error) => {
              handlerSpan.recordException(error)
              handlerSpan.setStatus({ code: SpanStatusCode.ERROR })
              handlerSpan.end()
              throw error
            }
          )
        }

        handlerSpan.end()
        return result
      } catch (error) {
        handlerSpan.recordException(error)
        handlerSpan.setStatus({ code: SpanStatusCode.ERROR })
        handlerSpan.end()
        throw error
      }
    }
  })

  fastify.addHook('onRequest', async function onRequestOtel (request, reply) {
    if (ignoreRoutes.has(request.routeOptions?.url)) return
    const parentContext = extractContext(otel, request.headers)
    const span = tracer.startSpan(
      formatSpanName(request),
      { kind: SpanKind.SERVER, attributes: buildRequestAttributes(request) },
      parentContext
    )
    request[kOtelSpan] = span
    if (opts.exposeApi !== false) request.otelSpan = span

    if (enableHookSpans) {
      request[kOtelHookSpans] = { spans: [] }
    }
  })

  if (enableHookSpans) {
    fastify.addHook('onRequest', async function onRequestHookSpan (request, reply) {
      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.onRequest', { kind: SpanKind.INTERNAL }, activeContext)
      request[kOtelHookSpans].spans.push({ name: 'onRequest', span })
    })

    fastify.addHook('preParsing', async function preParsingHookSpan (request, reply) {
      const lastSpan = request[kOtelHookSpans]?.spans[request[kOtelHookSpans].spans.length - 1]
      if (lastSpan) lastSpan.span.end()

      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.preParsing', { kind: SpanKind.INTERNAL }, activeContext)
      request[kOtelHookSpans].spans.push({ name: 'preParsing', span })
    })

    fastify.addHook('preValidation', async function preValidationHookSpan (request, reply) {
      const lastSpan = request[kOtelHookSpans]?.spans[request[kOtelHookSpans].spans.length - 1]
      if (lastSpan) lastSpan.span.end()

      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.preValidation', { kind: SpanKind.INTERNAL }, activeContext)
      request[kOtelHookSpans].spans.push({ name: 'preValidation', span })
    })

    fastify.addHook('preHandler', async function preHandlerHookSpan (request, reply) {
      const lastSpan = request[kOtelHookSpans]?.spans[request[kOtelHookSpans].spans.length - 1]
      if (lastSpan) lastSpan.span.end()

      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.preHandler', { kind: SpanKind.INTERNAL }, activeContext)
      request[kOtelHookSpans].spans.push({ name: 'preHandler', span })
    })

    fastify.addHook('preSerialization', async function preSerializationHookSpan (request, reply) {
      const lastSpan = request[kOtelHookSpans]?.spans[request[kOtelHookSpans].spans.length - 1]
      if (lastSpan) lastSpan.span.end()

      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.preSerialization', { kind: SpanKind.INTERNAL }, activeContext)
      request[kOtelHookSpans].spans.push({ name: 'preSerialization', span })
    })

    fastify.addHook('onSend', async function onSendHookSpan (request, reply) {
      const lastSpan = request[kOtelHookSpans]?.spans[request[kOtelHookSpans].spans.length - 1]
      if (lastSpan) lastSpan.span.end()

      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.onSend', { kind: SpanKind.INTERNAL }, activeContext)
      request[kOtelHookSpans].spans.push({ name: 'onSend', span })
    })

    fastify.addHook('onError', async function onErrorHookSpan (request, reply, error) {
      if (!request[kOtelSpan]) return
      const serverSpan = request[kOtelSpan]
      const activeContext = hasContextAPI ? trace.setSpan(context.active(), serverSpan) : undefined
      const span = tracer.startSpan('fastify.hook.onError', { kind: SpanKind.INTERNAL }, activeContext)
      span.end()
    })
  }

  fastify.addHook('onResponse', async function onResponseOtel (request, reply) {
    const span = request[kOtelSpan]
    if (!span) return

    if (enableHookSpans) {
      const lastSpan = request[kOtelHookSpans]?.spans[request[kOtelHookSpans].spans.length - 1]
      if (lastSpan) lastSpan.span.end()
    }

    span.setAttributes(buildResponseAttributes(request, reply))
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP ' + reply.statusCode })
    }
    span.end()
  })
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  const method = request.method || 'UNKNOWN'
  return route ? method + ' ' + route : method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
