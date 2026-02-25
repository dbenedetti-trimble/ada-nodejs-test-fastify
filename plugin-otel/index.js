'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')

async function otelPlugin (fastify, opts) {
  const {
    exposeApi = true,
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
    const urlWithoutQuery = url.split('?')[0]
    return ignoreRoutes.some(pattern => {
      if (typeof pattern === 'string') {
        return urlWithoutQuery === pattern
      }
      if (pattern instanceof RegExp) {
        return pattern.test(urlWithoutQuery)
      }
      return false
    })
  }

  function collectRequestAttributes (request) {
    const attributes = {
      'http.request.method': request.method
    }

    const parsedUrl = new URL(request.url, `${request.protocol}://${request.hostname}`)
    attributes['url.path'] = parsedUrl.pathname

    if (parsedUrl.search) {
      attributes['url.query'] = parsedUrl.search.slice(1)
    }

    attributes['url.scheme'] = request.protocol
    attributes['server.address'] = request.hostname
    attributes['server.port'] = request.socket?.localPort || (request.protocol === 'https' ? 443 : 80)
    attributes['network.protocol.version'] = request.raw.httpVersion

    if (request.headers['user-agent']) {
      attributes['user_agent.original'] = request.headers['user-agent']
    }

    if (request.headers['content-length']) {
      const contentLength = parseInt(request.headers['content-length'], 10)
      if (!isNaN(contentLength)) {
        attributes['http.request.header.content-length'] = contentLength
      }
    }

    return attributes
  }

  function createHookSpan (hookName, request) {
    if (!hookSpans || !request.otelContext) {
      return null
    }

    const span = tracer.startSpan(
      `fastify.hook.${hookName}`,
      {
        kind: otel.SpanKind.INTERNAL
      },
      request.otelContext
    )

    return span
  }

  function endHookSpan (request, hookName) {
    const spanKey = `otelHookSpan_${hookName}`
    if (request[spanKey]) {
      request[spanKey].end()
      delete request[spanKey]
    }
  }

  function createAndEndHookSpan (hookName, request) {
    const span = createHookSpan(hookName, request)
    if (span) {
      span.end()
    }
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

    const spanName = request.method

    const attributes = collectRequestAttributes(request)

    const span = tracer.startSpan(
      spanName,
      {
        kind: otel.SpanKind.SERVER,
        attributes
      },
      context
    )

    request.otelSpan = span
    request.otelContext = otel.trace.setSpan(context, span)

    createAndEndHookSpan('onRequest', request)
  })

  fastify.addHook('preParsing', async (request, reply, payload) => {
    if (!request.otelContext) {
      return payload
    }

    createAndEndHookSpan('preParsing', request)

    return payload
  })

  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.otelContext) {
      return
    }

    createAndEndHookSpan('preValidation', request)
  })

  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.otelSpan || !request.otelContext) {
      return
    }

    createAndEndHookSpan('preHandler', request)

    const handlerSpan = tracer.startSpan(
      'fastify.handler',
      {
        kind: otel.SpanKind.INTERNAL
      },
      request.otelContext
    )

    request.otelHandlerSpan = handlerSpan
  })

  fastify.addHook('preSerialization', async (request, reply, payload) => {
    if (!request.otelContext) {
      return payload
    }

    createAndEndHookSpan('preSerialization', request)

    request.otelInSerializationPhase = true

    return payload
  })

  fastify.addHook('onSend', async (request, reply, payload) => {
    createAndEndHookSpan('onSend', request)

    if (request.otelHandlerSpan) {
      const handlerSpan = request.otelHandlerSpan

      if (request.otelServerError) {
        handlerSpan.recordException(request.otelServerError)
        handlerSpan.setStatus({
          code: otel.SpanStatusCode.ERROR,
          message: request.otelServerError.message
        })
        delete request.otelServerError
      } else if (reply.statusCode >= 500) {
        handlerSpan.setStatus({
          code: otel.SpanStatusCode.ERROR,
          message: `HTTP ${reply.statusCode}`
        })
      }

      handlerSpan.end()
    }

    return payload
  })

  fastify.addHook('onError', async (request, reply, error) => {
    createAndEndHookSpan('onError', request)

    if (request.otelSpan) {
      request.otelServerError = error
      request.otelSpan.recordException(error)
      request.otelSpan.setStatus({
        code: otel.SpanStatusCode.ERROR,
        message: error.message
      })
    }
  })

  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.otelSpan) {
      return
    }

    const span = request.otelSpan

    span.setAttribute('http.response.status_code', reply.statusCode)

    if (request.routeOptions?.url) {
      span.setAttribute('http.route', request.routeOptions.url)
      const finalSpanName = spanNameFormatter
        ? spanNameFormatter(request)
        : `${request.method} ${request.routeOptions.url}`
      span.updateName(finalSpanName)
    } else {
      span.setAttributes({
        'http.route': 'unmatched',
        'error.type': '404'
      })
      span.updateName(`${request.method}`)
    }

    const contentLength = reply.getHeader('content-length')
    if (contentLength) {
      const length = parseInt(contentLength, 10)
      if (!isNaN(length)) {
        span.setAttribute('http.response.header.content-length', length)
      }
    }

    if (reply.statusCode >= 500) {
      span.setStatus({
        code: otel.SpanStatusCode.ERROR,
        message: `HTTP ${reply.statusCode}`
      })
    }

    span.end()
  })
}

module.exports = fp(otelPlugin, {
  fastify: '5.x',
  name: 'fastify-otel-plugin'
})
