'use strict'

const fp = require('fastify-plugin')
const { loadOtelApi } = require('./lib/otel-api')
const { extractContext } = require('./lib/context-propagation')
const { buildRequestAttributes, buildResponseAttributes } = require('./lib/span-attributes')

const kOtelSpan = Symbol('fastify.otel.span')
const kOtelContext = Symbol('fastify.otel.context')
const kOtelHandlerSpan = Symbol('fastify.otel.handlerSpan')
const kHookSpans = Symbol('fastify.otel.hookSpans')

const HOOK_SPAN_PHASES = new Set([
  'onRequest', 'preParsing', 'preValidation', 'preHandler',
  'preSerialization', 'onSend', 'onError'
])
const PAYLOAD_PHASES = new Set(['preParsing', 'onSend', 'preSerialization', 'onError'])

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
    request[kOtelContext] = spanContext
    if (opts.exposeApi !== false) request.otelSpan = span
    done()
  })

  fastify.addHook('preHandler', function preHandlerOtelCtx (request, reply, done) {
    const spanCtx = request[kOtelContext]
    if (!spanCtx) return done()
    const handlerSpan = tracer.startSpan('fastify.handler', {}, spanCtx)
    request[kOtelHandlerSpan] = handlerSpan
    context.with(spanCtx, done)
  })

  fastify.addHook('onSend', function onSendOtelHandler (request, reply, payload, done) {
    const span = request[kOtelHandlerSpan]
    if (span) {
      request[kOtelHandlerSpan] = null
      span.end()
    }
    done(null, payload)
  })

  fastify.addHook('onError', function onErrorOtelHandler (request, reply, error, done) {
    const handlerSpan = request[kOtelHandlerSpan]
    if (handlerSpan) {
      handlerSpan.recordException(error)
      handlerSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    } else {
      const serverSpan = request[kOtelSpan]
      if (serverSpan) serverSpan.recordException(error)
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

  if (opts.hookSpans !== false) {
    setupHookSpans(fastify, tracer)
  }
}

function setupHookSpans (fastify, tracer) {
  const hookCount = Object.create(null)
  const origAdd = fastify.addHook.bind(fastify)

  fastify.addHook = function patchedAddHook (name, fn) {
    if (HOOK_SPAN_PHASES.has(name)) {
      if (!hookCount[name]) origAdd(name, makeSpanStart(name, tracer))
      hookCount[name] = (hookCount[name] || 0) + 1
      origAdd(name, fn)
      origAdd(name, makeSpanEnd(name, hookCount[name], hookCount))
      return fastify
    }
    return origAdd(name, fn)
  }
}

function createHookSpan (req, phase, tracer) {
  const ctx = req[kOtelContext]
  if (!ctx) return
  if (!req[kHookSpans]) req[kHookSpans] = Object.create(null)
  req[kHookSpans][phase] = tracer.startSpan('fastify.hook.' + phase, {}, ctx)
}

function makeSpanStart (phase, tracer) {
  if (PAYLOAD_PHASES.has(phase)) {
    return function hookSpanStart (req, reply, payload, done) { createHookSpan(req, phase, tracer); done() }
  }
  return function hookSpanStart (req, reply, done) { createHookSpan(req, phase, tracer); done() }
}

function makeSpanEnd (phase, myIndex, hookCount) {
  if (PAYLOAD_PHASES.has(phase)) {
    return function hookSpanEnd (req, reply, payload, done) {
      if (myIndex === hookCount[phase]) req[kHookSpans]?.[phase]?.end()
      done()
    }
  }
  return function hookSpanEnd (req, reply, done) {
    if (myIndex === hookCount[phase]) req[kHookSpans]?.[phase]?.end()
    done()
  }
}

function defaultSpanName (request) {
  const route = request.routeOptions?.url
  return route ? request.method + ' ' + route : request.method
}

module.exports = fp(otelPlugin, { fastify: '5.x', name: 'fastify-otel' })
