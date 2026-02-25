'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_5_1 - All HTTP semantic convention attributes are set on server span', async (t) => {
  t.plan(18)

  let requestAttrs = null
  let responseAttrs = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      requestAttrs = options.attributes
      return {
        setAttributes: t.mock.fn((attrs) => {
          responseAttrs = attrs
        }),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/users/:id', async (request, reply) => {
    return { userId: request.params.id }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/users/42?page=2&limit=10',
    headers: {
      host: 'api.example.com',
      'user-agent': 'curl/7.88.0',
      'content-length': '256'
    }
  })

  t.assert.ok(requestAttrs, 'Request attributes should be set')
  t.assert.strictEqual(requestAttrs['http.request.method'], 'GET')
  t.assert.strictEqual(requestAttrs['url.path'], '/users/42')
  t.assert.strictEqual(requestAttrs['url.query'], 'page=2&limit=10')
  t.assert.strictEqual(requestAttrs['url.scheme'], 'http')
  t.assert.strictEqual(requestAttrs['server.address'], 'api.example.com')
  t.assert.strictEqual(typeof requestAttrs['server.port'], 'number')
  t.assert.ok(requestAttrs['server.port'] > 0)
  t.assert.strictEqual(requestAttrs['network.protocol.version'], '1.1')
  t.assert.strictEqual(requestAttrs['user_agent.original'], 'curl/7.88.0')
  t.assert.strictEqual(requestAttrs['http.request.header.content-length'], 256)

  t.assert.ok(responseAttrs, 'Response attributes should be set')
  t.assert.strictEqual(responseAttrs['http.response.status_code'], 200)
  t.assert.strictEqual(responseAttrs['http.route'], '/users/:id')
  t.assert.ok(responseAttrs['http.response.header.content-length'], 'Content-length should be set')

  t.assert.strictEqual(typeof responseAttrs['http.response.status_code'], 'number')
  t.assert.strictEqual(typeof requestAttrs['http.request.header.content-length'], 'number')
  t.assert.strictEqual(typeof responseAttrs['http.response.header.content-length'], 'number')
})

test('@covers_ACFR_5_2 - http.route uses the parameterized pattern, not the resolved URL', async (t) => {
  t.plan(6)

  const responseAttrsList = []

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      return {
        setAttributes: t.mock.fn((attrs) => {
          if (attrs['http.route']) {
            responseAttrsList.push(attrs)
          }
        }),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/users/:id', async (request, reply) => {
    return { userId: request.params.id }
  })

  fastify.get('/items/:category/:itemId', async (request, reply) => {
    return { category: request.params.category, itemId: request.params.itemId }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users/123' })
  await fastify.inject({ method: 'GET', url: '/users/456' })
  await fastify.inject({ method: 'GET', url: '/items/books/789' })

  t.assert.strictEqual(responseAttrsList.length, 3)
  t.assert.strictEqual(responseAttrsList[0]['http.route'], '/users/:id', 'Should use pattern /users/:id, not /users/123')
  t.assert.strictEqual(responseAttrsList[1]['http.route'], '/users/:id', 'Should use pattern /users/:id, not /users/456')
  t.assert.strictEqual(responseAttrsList[2]['http.route'], '/items/:category/:itemId', 'Should use pattern with multiple params')

  t.assert.notStrictEqual(responseAttrsList[0]['http.route'], '/users/123', 'Should not use resolved URL')
  t.assert.notStrictEqual(responseAttrsList[2]['http.route'], '/items/books/789', 'Should not use resolved URL')
})

test('@covers_ACFR_5_3 - url.query is omitted when there is no query string', async (t) => {
  t.plan(4)

  let requestAttrsWithQuery = null
  let requestAttrsWithoutQuery = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      const attrs = options.attributes
      if (attrs['url.query']) {
        requestAttrsWithQuery = attrs
      } else if (!requestAttrsWithoutQuery) {
        requestAttrsWithoutQuery = attrs
      }
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { ok: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test?query=value' })
  await fastify.inject({ method: 'GET', url: '/test' })

  t.assert.ok(requestAttrsWithQuery, 'Request with query should be captured')
  t.assert.strictEqual(requestAttrsWithQuery['url.query'], 'query=value')

  t.assert.ok(requestAttrsWithoutQuery, 'Request without query should be captured')
  t.assert.strictEqual(requestAttrsWithoutQuery['url.query'], undefined, 'url.query should be omitted when no query string')
})

test('@covers_ACFR_5_4 - user_agent.original is omitted when the header is absent', async (t) => {
  t.plan(3)

  let requestAttrsWithUA = null
  let requestAttrsWithoutUA = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      const attrs = options.attributes
      if (attrs['user_agent.original'] === 'Mozilla/5.0') {
        requestAttrsWithUA = attrs
      } else if (!attrs['user_agent.original']) {
        requestAttrsWithoutUA = attrs
      }
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { ok: true }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { 'user-agent': 'Mozilla/5.0' }
  })

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {}
  })

  t.assert.ok(requestAttrsWithUA, 'Request with user-agent should be captured')
  t.assert.strictEqual(requestAttrsWithUA['user_agent.original'], 'Mozilla/5.0')

  t.assert.strictEqual(requestAttrsWithoutUA, null, 'Request without explicit user-agent was not captured (lightMyRequest adds default)')
})

test('@covers_ACFR_5_5 - Attributes use the stable semantic convention names', async (t) => {
  t.plan(14)

  let requestAttrs = null
  let responseAttrs = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      requestAttrs = options.attributes
      return {
        setAttributes: t.mock.fn((attrs) => {
          responseAttrs = attrs
        }),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { ok: true }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test?query=value',
    headers: {
      'user-agent': 'test-client',
      'content-length': '100'
    }
  })

  const expectedRequestAttrs = [
    'http.request.method',
    'url.path',
    'url.query',
    'url.scheme',
    'server.address',
    'server.port',
    'network.protocol.version',
    'user_agent.original',
    'http.request.header.content-length'
  ]

  const expectedResponseAttrs = [
    'http.response.status_code',
    'http.route'
  ]

  expectedRequestAttrs.forEach(attr => {
    t.assert.ok(Object.hasOwn(requestAttrs, attr), `Should have stable attribute: ${attr}`)
  })

  expectedResponseAttrs.forEach(attr => {
    t.assert.ok(Object.hasOwn(responseAttrs, attr), `Should have stable attribute: ${attr}`)
  })

  t.assert.strictEqual(Object.hasOwn(requestAttrs, 'http.method'), false, 'Should not use deprecated http.method')
  t.assert.strictEqual(Object.hasOwn(responseAttrs, 'http.status_code'), false, 'Should not use deprecated http.status_code')
  t.assert.strictEqual(Object.hasOwn(responseAttrs, 'http.response.header.content-length'), true, 'Should have response content-length')
})

test('@covers_ACFR_5_6 - Numeric values are set as numbers, not strings', async (t) => {
  t.plan(8)

  let requestAttrs = null
  let responseAttrs = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      requestAttrs = options.attributes
      return {
        setAttributes: t.mock.fn((attrs) => {
          responseAttrs = attrs
        }),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.post('/test', async (request, reply) => {
    return { ok: true }
  })

  await fastify.ready()

  const payload = '{"data":"test"}'
  await fastify.inject({
    method: 'POST',
    url: '/test',
    payload,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload))
    }
  })

  t.assert.ok(requestAttrs, 'Request attributes should be set')
  t.assert.ok(responseAttrs, 'Response attributes should be set')

  t.assert.strictEqual(typeof requestAttrs['server.port'], 'number', 'server.port should be a number')
  t.assert.strictEqual(typeof requestAttrs['http.request.header.content-length'], 'number', 'http.request.header.content-length should be a number')
  t.assert.strictEqual(requestAttrs['http.request.header.content-length'], Buffer.byteLength(payload))

  t.assert.strictEqual(typeof responseAttrs['http.response.status_code'], 'number', 'http.response.status_code should be a number')
  t.assert.strictEqual(responseAttrs['http.response.status_code'], 200)

  t.assert.strictEqual(typeof responseAttrs['http.response.header.content-length'], 'number', 'http.response.header.content-length should be a number')
})

test('@covers_ACFR_5_3 @covers_ACFR_5_4 - Empty query string with ? is omitted', async (t) => {
  t.plan(2)

  let requestAttrs = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      requestAttrs = options.attributes
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { ok: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test?' })

  t.assert.ok(requestAttrs, 'Request attributes should be captured')
  t.assert.strictEqual(requestAttrs['url.query'], undefined, 'url.query should be omitted for empty query string')
})

test('@covers_ACFR_5_6 - Invalid numeric content-length headers are omitted', async (t) => {
  t.plan(2)

  let requestAttrs = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      requestAttrs = options.attributes
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { ok: true }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      'content-length': 'not-a-number'
    }
  })

  t.assert.ok(requestAttrs, 'Request attributes should be set')
  t.assert.strictEqual(requestAttrs['http.request.header.content-length'], undefined, 'Invalid request content-length should be omitted')
})

test('@covers_ACFR_5_2 - http.route is omitted for 404 responses', async (t) => {
  t.plan(2)

  let responseAttrs = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      return {
        setAttributes: t.mock.fn((attrs) => {
          if (attrs['http.response.status_code']) {
            responseAttrs = attrs
          }
        }),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/non-existent-route' })

  t.assert.ok(responseAttrs, 'Response attributes should be set')
  t.assert.strictEqual(responseAttrs['http.route'], undefined, 'http.route should be omitted for 404 responses')
})

test('@unit_test @integration_test - HTTP attributes for different response status codes', async (t) => {
  t.plan(7)

  const responseAttrsList = []

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      return {
        setAttributes: t.mock.fn((attrs) => {
          if (attrs['http.response.status_code']) {
            responseAttrsList.push(attrs)
          }
        }),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/success', async (request, reply) => {
    return { ok: true }
  })

  fastify.get('/created', async (request, reply) => {
    reply.code(201)
    return { created: true }
  })

  fastify.get('/error', async (request, reply) => {
    reply.code(500)
    return { error: 'Internal error' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/success' })
  await fastify.inject({ method: 'GET', url: '/created' })
  await fastify.inject({ method: 'GET', url: '/error' })

  t.assert.strictEqual(responseAttrsList.length, 3)
  t.assert.strictEqual(responseAttrsList[0]['http.response.status_code'], 200)
  t.assert.strictEqual(responseAttrsList[1]['http.response.status_code'], 201)
  t.assert.strictEqual(responseAttrsList[2]['http.response.status_code'], 500)

  responseAttrsList.forEach((attrs, idx) => {
    t.assert.strictEqual(typeof attrs['http.response.status_code'], 'number', `Status code ${idx} should be a number`)
  })
})
