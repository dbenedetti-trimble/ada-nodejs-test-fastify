/**
 * Fastify Request Injection Test Template (No Network)
 * 
 * Use fastify.inject() for fast, in-process testing without starting an HTTP server.
 * Ideal for unit tests that don't need actual network requests.
 * 
 * Test Quality Principles:
 * - Use inject() for speed and simplicity
 * - Test request/response without network overhead
 * - Validate headers, status codes, and response bodies
 * 
 * Execution: npm test
 */

'use strict'

const { test } = require('node:test')
const Fastify = require('..')

test('[FEATURE_NAME] - inject GET request', async t => {
  t.plan(3)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/users/:id', async (request, reply) => {
    return {
      id: request.params.id,
      name: 'John Doe'
    }
  })
  
  // No need to start server
  const response = await fastify.inject({
    method: 'GET',
    url: '/users/123'
  })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['content-type'], 'application/json; charset=utf-8')
  t.assert.deepStrictEqual(response.json(), { id: '123', name: 'John Doe' })
})

test('[FEATURE_NAME] - inject POST request with body', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.post('/users', async (request, reply) => {
    const { name, email } = request.body
    return {
      id: 'new-id',
      name,
      email,
      created: true
    }
  })
  
  const response = await fastify.inject({
    method: 'POST',
    url: '/users',
    headers: {
      'content-type': 'application/json'
    },
    payload: {
      name: 'Jane Doe',
      email: 'jane@example.com'
    }
  })
  
  const data = response.json()
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(data.created, true)
})

test('[FEATURE_NAME] - inject with query parameters', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/search', async (request, reply) => {
    return {
      query: request.query.q,
      limit: request.query.limit || 10
    }
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/search?q=fastify&limit=20'
  })
  
  const data = response.json()
  
  t.assert.strictEqual(data.query, 'fastify')
  t.assert.strictEqual(data.limit, '20')
})

test('[FEATURE_NAME] - inject with custom headers', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/protected', async (request, reply) => {
    const auth = request.headers.authorization
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    return { authorized: true }
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/protected',
    headers: {
      authorization: 'Bearer token123'
    }
  })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.json().authorized, true)
})

test('[FEATURE_NAME] - inject error response', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/error', async (request, reply) => {
    reply.code(500).send({ error: 'Internal Server Error' })
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/error'
  })
  
  t.assert.strictEqual(response.statusCode, 500)
  t.assert.strictEqual(response.json().error, 'Internal Server Error')
})

test('[FEATURE_NAME] - inject validation error', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.post('/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    return { email: request.body.email }
  })
  
  const response = await fastify.inject({
    method: 'POST',
    url: '/validate',
    headers: { 'content-type': 'application/json' },
    payload: { email: 'not-an-email' }
  })
  
  t.assert.strictEqual(response.statusCode, 400)
  t.assert.ok(response.json().message.includes('email'))
})
