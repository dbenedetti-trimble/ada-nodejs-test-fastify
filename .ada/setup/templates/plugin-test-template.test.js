/**
 * Fastify Plugin Test Template
 * 
 * Test Quality Principles:
 * - Test plugin registration and functionality with real Fastify instance
 * - Validate plugin decorators, hooks, and route additions
 * - Test plugin options and configuration
 * - Cover plugin error handling and edge cases
 * 
 * Execution: npm test
 */

'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const fp = require('fastify-plugin')

/**
 * Example Plugin Definition
 */
const myPlugin = fp(async function (fastify, opts) {
  // Add decorator
  fastify.decorate('myPluginUtility', function () {
    return opts.message || 'default'
  })
  
  // Add hook
  fastify.addHook('onRequest', async (request, reply) => {
    request.pluginData = { timestamp: Date.now() }
  })
  
  // Add route
  fastify.get('/plugin-route', async (request, reply) => {
    return {
      message: fastify.myPluginUtility(),
      timestamp: request.pluginData.timestamp
    }
  })
})

/**
 * Plugin Registration Tests
 */
test('[PLUGIN_NAME] - registers successfully', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  await fastify.register(myPlugin, { message: 'test' })
  
  t.after(() => { fastify.close() })
  
  // Assert: Verify plugin registered
  t.assert.ok(fastify.myPluginUtility, 'Plugin decorator should exist')
})

test('[PLUGIN_NAME] - decorator works correctly', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  await fastify.register(myPlugin, { message: 'custom message' })
  
  t.after(() => { fastify.close() })
  
  // Assert: Verify decorator functionality
  t.assert.strictEqual(fastify.myPluginUtility(), 'custom message')
})

test('[PLUGIN_NAME] - adds routes correctly', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  await fastify.register(myPlugin, { message: 'route test' })
  await fastify.listen({ port: 0 })
  
  t.after(() => { fastify.close() })
  
  // Act: Test plugin route
  const response = await fastify.inject({ url: '/plugin-route' })
  const data = response.json()
  
  // Assert: Verify route behavior
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(data.message, 'route test')
})

test('[PLUGIN_NAME] - hook executes correctly', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  await fastify.register(myPlugin, { message: 'hook test' })
  await fastify.listen({ port: 0 })
  
  t.after(() => { fastify.close() })
  
  // Act
  const response = await fastify.inject({ url: '/plugin-route' })
  const data = response.json()
  
  // Assert: Verify hook added data
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(data.timestamp, 'Hook should add timestamp')
})

test('[PLUGIN_NAME] - handles missing options with defaults', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  // Register without options
  await fastify.register(myPlugin)
  
  t.after(() => { fastify.close() })
  
  // Assert: Verify default behavior
  t.assert.strictEqual(fastify.myPluginUtility(), 'default')
})

test('[PLUGIN_NAME] - handles plugin errors', async t => {
  t.plan(1)
  
  const fastify = Fastify({ logger: false })
  
  const errorPlugin = fp(async function (fastify, opts) {
    if (!opts.required) {
      throw new Error('Required option missing')
    }
  })
  
  // Assert: Verify error handling
  await t.assert.rejects(
    fastify.register(errorPlugin, {}),
    { message: 'Required option missing' }
  )
})

/**
 * Plugin Encapsulation Test
 */
test('[PLUGIN_NAME] - respects encapsulation', async t => {
  t.plan(2)
  
  const fastify = Fastify({ logger: false })
  
  const encapsulatedPlugin = async function (fastify, opts) {
    fastify.decorate('encapsulated', 'value')
  }
  
  await fastify.register(encapsulatedPlugin)
  
  t.after(() => { fastify.close() })
  
  // Assert: Decorator not available outside plugin scope (unless using fastify-plugin)
  t.assert.ok(!fastify.encapsulated, 'Should be encapsulated')
  
  // Create child context to verify
  await fastify.register(async (childFastify) => {
    t.assert.ok(!childFastify.encapsulated, 'Should not leak to sibling contexts')
  })
})
