'use strict'

const { test } = require('node:test')
const Fastify = require('..')

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for addHook', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.addHook('onRequest', () => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('addHook'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for route via shorthand', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.get('/test', () => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('route'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for route', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.route({
      method: 'GET',
      url: '/test',
      handler: () => {}
    })
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('route'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for register', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    await fastify.register((instance, opts, done) => {
      done()
    })
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'AVV_ERR_ROOT_PLG_BOOTED')
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for addSchema', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.addSchema({
      $id: 'test-schema',
      type: 'object',
      properties: {
        hello: { type: 'string' }
      }
    })
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('addSchema'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for setNotFoundHandler', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.setNotFoundHandler(() => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('setNotFoundHandler'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for setErrorHandler', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.setErrorHandler(() => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('setErrorHandler'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('Enhanced FST_ERR_INSTANCE_ALREADY_LISTENING for setReplySerializer', async t => {
  const fastify = Fastify()
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.setReplySerializer(() => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('setReplySerializer'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})
