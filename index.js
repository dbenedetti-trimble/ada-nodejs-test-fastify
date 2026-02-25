'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelHandlerSpan = Symbol('fastify.otel.handler.span')

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

  if (opts.exposeApi !== false) {
    fastify.decorate('otel', { tracer })
    fastify.decorateRequest('otelSpan', null)
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
  const method = request.method || 'UNKNOWN'
  return route ? method + ' ' + route : method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
