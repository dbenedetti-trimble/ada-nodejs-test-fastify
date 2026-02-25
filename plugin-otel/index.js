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

  fastify.decorateRequest('otelSpan', null)
  fastify.decorateRequest('otelContext', null)
  fastify.decorateRequest('otelHandlerSpan', null)
  fastify.decorateRequest('otelServerError', null)
  fastify.decorateRequest('otelInSerializationPhase', false)

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

  function startHookSpan (hookName, request) {
    if (!hookSpans || !request.otelContext) {
      return
    }

    const span = tracer.startSpan(
      `fastify.hook.${hookName}`,
      {
        kind: otel.SpanKind.INTERNAL
      },
      request.otelContext
    )

    const spanKey = `otelHookSpan_${hookName}`
    request[spanKey] = span
  }

  function endHookSpan (request, hookName) {
    const spanKey = `otelHookSpan_${hookName}`
    if (request[spanKey]) {
      request[spanKey].end()
      delete request[spanKey]
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

    startHookSpan('onRequest', request)
  })

  fastify.addHook('preParsing', async (request, reply, payload) => {
    if (!request.otelContext) {
      return payload
    }

    endHookSpan(request, 'onRequest')
    startHookSpan('preParsing', request)

    return payload
  })

  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.otelContext) {
      return
    }

    endHookSpan(request, 'preParsing')
    startHookSpan('preValidation', request)
  })

  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.otelSpan || !request.otelContext) {
      return
    }

    endHookSpan(request, 'preValidation')
    startHookSpan('preHandler', request)

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

    endHookSpan(request, 'preHandler')
    startHookSpan('preSerialization', request)

    request.otelInSerializationPhase = true

    return payload
  })

  fastify.addHook('onSend', async (request, reply, payload) => {
    endHookSpan(request, 'preSerialization')
    startHookSpan('onSend', request)

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
    endHookSpan(request, 'preHandler')
    endHookSpan(request, 'preSerialization')
    endHookSpan(request, 'onSend')
    startHookSpan('onError', request)

    if (request.otelSpan) {
      request.otelServerError = error
      request.otelSpan.recordException(error)
    }
  })

  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.otelSpan) {
      return
    }

    endHookSpan(request, 'onSend')
    endHookSpan(request, 'onError')

    const span = request.otelSpan

    span.setAttribute('http.response.status_code', reply.statusCode)

    if (request.routeOptions?.url) {
      span.setAttribute('http.route', request.routeOptions.url)
      const finalSpanName = spanNameFormatter
        ? spanNameFormatter(request)
        : `${request.method} ${request.routeOptions.url}`
      span.updateName(finalSpanName)
    } else {
      span.setAttribute('http.route', 'unmatched')
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
