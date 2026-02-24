/**
 * Fastify Schema Validation Test Template
 * 
 * Test Quality Principles:
 * - Validate JSON schema validation behavior
 * - Test both valid and invalid inputs
 * - Verify error messages are helpful
 * - Test request and response validation
 * 
 * Fastify uses JSON Schema for validation via @fastify/ajv-compiler
 * 
 * Execution: npm test
 */

'use strict'

const { test } = require('node:test')
const Fastify = require('..')

/**
 * Request Body Validation
 */
test('[SCHEMA_NAME] - validates valid request body', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.post('/users', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          age: { type: 'number', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    return { created: true, user: request.body }
  })
  
  const response = await fastify.inject({
    method: 'POST',
    url: '/users',
    headers: { 'content-type': 'application/json' },
    payload: {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    }
  })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.json().created, true)
})

test('[SCHEMA_NAME] - rejects invalid request body', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.post('/users', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    return { created: true }
  })
  
  // Missing required field
  const response = await fastify.inject({
    method: 'POST',
    url: '/users',
    headers: { 'content-type': 'application/json' },
    payload: {
      name: 'John Doe'
      // email missing
    }
  })
  
  t.assert.strictEqual(response.statusCode, 400)
  t.assert.ok(response.json().message.includes('email'))
})

test('[SCHEMA_NAME] - rejects invalid email format', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.post('/users', {
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
    return { created: true }
  })
  
  const response = await fastify.inject({
    method: 'POST',
    url: '/users',
    headers: { 'content-type': 'application/json' },
    payload: {
      email: 'not-an-email'
    }
  })
  
  t.assert.strictEqual(response.statusCode, 400)
  t.assert.ok(response.json().message.toLowerCase().includes('email'))
})

/**
 * Query Parameter Validation
 */
test('[SCHEMA_NAME] - validates query parameters', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          offset: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    return { query: request.query }
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/search?q=fastify&limit=10'
  })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.json().query.q, 'fastify')
})

test('[SCHEMA_NAME] - rejects invalid query parameters', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
    return { query: request.query }
  })
  
  // limit exceeds maximum
  const response = await fastify.inject({
    method: 'GET',
    url: '/search?q=fastify&limit=200'
  })
  
  t.assert.strictEqual(response.statusCode, 400)
})

/**
 * Response Schema Validation (Serialization)
 */
test('[SCHEMA_NAME] - serializes response according to schema', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/user/:id', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' }
            // password intentionally not in response schema
          }
        }
      }
    }
  }, async (request, reply) => {
    // Return object with password (should be filtered out)
    return {
      id: request.params.id,
      name: 'John Doe',
      email: 'john@example.com',
      password: 'secret123'  // Will be removed by serialization
    }
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/user/123'
  })
  
  const data = response.json()
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(!data.password, 'Password should not be in serialized response')
})

/**
 * Headers Validation
 */
test('[SCHEMA_NAME] - validates request headers', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/protected', {
    schema: {
      headers: {
        type: 'object',
        required: ['authorization'],
        properties: {
          authorization: { type: 'string', pattern: '^Bearer .+' }
        }
      }
    }
  }, async (request, reply) => {
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

test('[SCHEMA_NAME] - rejects missing required header', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/protected', {
    schema: {
      headers: {
        type: 'object',
        required: ['authorization'],
        properties: {
          authorization: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    return { authorized: true }
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/protected'
    // Missing authorization header
  })
  
  t.assert.strictEqual(response.statusCode, 400)
})

/**
 * Params Validation
 */
test('[SCHEMA_NAME] - validates URL parameters', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/user/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' }
        }
      }
    }
  }, async (request, reply) => {
    return { id: request.params.id }
  })
  
  const response = await fastify.inject({
    method: 'GET',
    url: '/user/123'
  })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.json().id, '123')
})

test('[SCHEMA_NAME] - rejects invalid URL parameter format', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  fastify.get('/user/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' }
        }
      }
    }
  }, async (request, reply) => {
    return { id: request.params.id }
  })
  
  // Non-numeric id
  const response = await fastify.inject({
    method: 'GET',
    url: '/user/abc'
  })
  
  t.assert.strictEqual(response.statusCode, 400)
})
