'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')

async function otelPlugin (fastify, opts) {
  const {
    exposeApi = false,
    hookSpans = true,
    ignoreRoutes = [],
    spanNameFormatter = null
  } = opts

  const otel = loadOtelApi()

  if (otel === false) {
    fastify.log.debug('@opentelemetry/api not found, instrumentation disabled')
    return
  }

  const tracer = otel.trace.getTracer('fastify-otel-plugin', '1.0.0')

  if (exposeApi) {
    fastify.decorate('otel', {
      tracer
    })
  }

  function shouldIgnoreRoute (url) {
    return ignoreRoutes.some(pattern => {
      if (typeof pattern === 'string') {
        return url === pattern
      }
      if (pattern instanceof RegExp) {
        return pattern.test(url)
      }
      return false
    })
  }

  fastify.addHook('onRequest', async (request, reply) => {
    if (shouldIgnoreRoute(request.url)) {
      return
    }

    const context = otel.propagation.extract(
      otel.ROOT_CONTEXT,
      request.headers,
      {
        get (carrier, key) {
          return carrier[key]
        },
        keys (carrier) {
          return Object.keys(carrier)
        }
      }
    )

    const spanName = spanNameFormatter
      ? spanNameFormatter(request)
      : `${request.method} ${request.routeOptions?.url || request.url}`

    const span = tracer.startSpan(
      spanName,
      {
        kind: otel.SpanKind.SERVER,
        attributes: {}
      },
      context
    )

    request.otelSpan = span
    request.otelContext = otel.trace.setSpan(context, span)
  })

  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.otelSpan) {
      return
    }

    request.otelSpan.end()
  })
}

module.exports = fp(otelPlugin, {
  fastify: '5.x',
  name: 'fastify-otel-plugin'
})
