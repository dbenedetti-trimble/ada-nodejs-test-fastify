/**
 * Fastify Mock/Stub Test Template
 * 
 * Test Quality Principles:
 * - Mock external dependencies only (APIs, databases, file systems)
 * - Use proxyquire for dependency injection
 * - Use @sinonjs/fake-timers for time-dependent code
 * - Keep mocking minimal and focused
 * 
 * Real Dependencies vs Mocks:
 * - Mock: External HTTP APIs, databases, file systems, third-party services
 * - Real: Business logic, internal services, Fastify core components
 * 
 * Execution: npm test
 */

'use strict'

const { test } = require('node:test')
const proxyquire = require('proxyquire')
const FakeTimers = require('@sinonjs/fake-timers')
const Fastify = require('..')

/**
 * Example: Mocking External HTTP API
 */
test('[FEATURE_NAME] - mocks external API call', async t => {
  t.plan(2)
  
  // Mock external fetch call
  const mockFetch = async (url) => {
    return {
      ok: true,
      json: async () => ({ id: 1, name: 'Mocked User' })
    }
  }
  
  // Use proxyquire to inject mock
  const myModule = proxyquire('../lib/myModule', {
    'undici': { fetch: mockFetch }
  })
  
  const result = await myModule.fetchUserData('123')
  
  t.assert.strictEqual(result.id, 1)
  t.assert.strictEqual(result.name, 'Mocked User')
})

/**
 * Example: Mocking Database Calls
 */
test('[FEATURE_NAME] - mocks database query', async t => {
  t.plan(2)
  
  const mockDb = {
    query: async (sql, params) => {
      return [{ id: params[0], username: 'testuser' }]
    }
  }
  
  const userService = proxyquire('../lib/userService', {
    './db': mockDb
  })
  
  const user = await userService.getUserById('123')
  
  t.assert.strictEqual(user.id, '123')
  t.assert.strictEqual(user.username, 'testuser')
})

/**
 * Example: Using Fake Timers
 */
test('[FEATURE_NAME] - uses fake timers for time-dependent logic', async t => {
  t.plan(1)
  
  const clock = FakeTimers.install({ now: new Date('2025-01-01T00:00:00Z') })
  
  t.after(() => { clock.uninstall() })
  
  // Code that uses Date.now() or setTimeout
  const startTime = Date.now()
  
  // Fast-forward time by 1 hour
  clock.tick(3600000)
  
  const endTime = Date.now()
  
  t.assert.strictEqual(endTime - startTime, 3600000)
})

/**
 * Example: Mocking File System Operations
 */
test('[FEATURE_NAME] - mocks file system read', async t => {
  t.plan(1)
  
  const mockFs = {
    readFile: async (path, encoding) => {
      return '{"config": "mocked"}'
    }
  }
  
  const configLoader = proxyquire('../lib/configLoader', {
    'fs/promises': mockFs
  })
  
  const config = await configLoader.loadConfig('/path/to/config.json')
  
  t.assert.strictEqual(config.config, 'mocked')
})

/**
 * Example: Testing with Mocked External Service in Fastify Route
 */
test('[FEATURE_NAME] - Fastify route with mocked external service', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  // Mock external service
  const mockExternalService = {
    fetchData: async () => ({ data: 'mocked response' })
  }
  
  // Inject mock into route
  fastify.decorate('externalService', mockExternalService)
  
  fastify.get('/data', async (request, reply) => {
    const result = await fastify.externalService.fetchData()
    return result
  })
  
  t.after(() => { fastify.close() })
  
  const response = await fastify.inject({ url: '/data' })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.json().data, 'mocked response')
})

/**
 * Example: Partial Mock (Real and Mocked Components)
 */
test('[FEATURE_NAME] - combines real and mocked components', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  // Real business logic
  const calculateTotal = (items) => {
    return items.reduce((sum, item) => sum + item.price, 0)
  }
  
  // Mock database
  const mockDb = {
    getItems: async () => [
      { id: 1, price: 10 },
      { id: 2, price: 20 }
    ]
  }
  
  fastify.decorate('db', mockDb)
  
  fastify.get('/total', async (request, reply) => {
    const items = await fastify.db.getItems()
    const total = calculateTotal(items)  // Real business logic
    return { total }
  })
  
  t.after(() => { fastify.close() })
  
  const response = await fastify.inject({ url: '/total' })
  
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.json().total, 30)
})

/**
 * Example: Testing Error Handling with Mocked Failure
 */
test('[FEATURE_NAME] - handles mocked external service failure', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  // Mock external service that fails
  const mockFailingService = {
    fetchData: async () => {
      throw new Error('Service unavailable')
    }
  }
  
  fastify.decorate('externalService', mockFailingService)
  
  fastify.get('/data', async (request, reply) => {
    try {
      const result = await fastify.externalService.fetchData()
      return result
    } catch (err) {
      reply.code(503).send({ error: 'Service unavailable' })
    }
  })
  
  t.after(() => { fastify.close() })
  
  const response = await fastify.inject({ url: '/data' })
  
  t.assert.strictEqual(response.statusCode, 503)
  t.assert.strictEqual(response.json().error, 'Service unavailable')
})
