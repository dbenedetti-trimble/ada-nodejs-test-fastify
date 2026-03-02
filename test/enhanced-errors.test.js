'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const { getServerUrl } = require('./helper')

test('IMP-1: addHook after start includes guidance', async t => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')
  await fastify.listen({ port: 0 })
  t.after(() => { fastify.close() })

  try {
    fastify.addHook('onRequest', async () => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('addHook'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('IMP-1: route registration after start includes guidance', async t => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')
  await fastify.listen({ port: 0 })
  t.after(() => { fastify.close() })

  try {
    fastify.get('/test', async () => 'test')
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('route'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('IMP-1: setErrorHandler after start includes guidance', async t => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')
  await fastify.listen({ port: 0 })
  t.after(() => { fastify.close() })

  try {
    fastify.setErrorHandler(() => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('setErrorHandler'))
    t.assert.ok(e.message.includes('inside a plugin register function'))
  }
})

test('IMP-2: hook name in async arity error - onRequest', t => {
  const fastify = Fastify()

  try {
    fastify.addHook('onRequest', async (req, reply, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('"onRequest"'))
  }
})

test('IMP-2: hook name in async arity error - preSerialization', t => {
  const fastify = Fastify()

  try {
    fastify.addHook('preSerialization', async (req, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('"preSerialization"'))
  }
})

test('IMP-2: hook name in async arity error - onSend', t => {
  const fastify = Fastify()

  try {
    fastify.addHook('onSend', async (req, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('"onSend"'))
  }
})

test('IMP-2: hook name in async arity error - route-level preHandler', t => {
  const fastify = Fastify()

  try {
    fastify.get('/', {
      preHandler: [async (request, reply, done) => {}]
    }, async () => 'ok')
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('"preHandler"'))
  }
})
