'use strict'

const { test } = require('node:test')
const Fastify = require('../fastify')

test('IMP-1: addHook after start includes guidance text', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  fastify.get('/', async () => ({ ok: true }))
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.addHook('onRequest', async (req, reply) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('addHook'), 'message should include operation name')
    t.assert.ok(e.message.includes('inside a plugin register function'), 'message should include guidance text')
  }
})

test('IMP-1: route shorthand after start includes guidance text', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  fastify.get('/', async () => ({ ok: true }))
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.get('/test', async () => ({ ok: true }))
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('route'), 'message should include operation name')
    t.assert.ok(e.message.includes('inside a plugin register function'), 'message should include guidance text')
  }
})

test('IMP-1: register after start throws an error', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  fastify.get('/', async () => ({ ok: true }))
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    await fastify.register(async (instance) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.ok(e instanceof Error, 'should throw an error when register is called after server starts')
  }
})

test('IMP-2: addHook onRequest (3-arg) error includes hook name', t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })

  try {
    fastify.addHook('onRequest', async (req, reply, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequest'), 'message should include hook name')
  }
})

test('IMP-2: addHook onSend (4-arg) error includes hook name', t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })

  try {
    fastify.addHook('onSend', async (req, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'), 'message should include hook name')
  }
})

test('IMP-2: route-level preHandler error includes hook name', t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })

  try {
    fastify.get('/', {
      preHandler: [async (req, reply, done) => {}]
    }, async () => ({ ok: true }))
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'), 'message should include hook name')
  }
})

test('IMP-2: route-level preSerialization error includes hook name', t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })

  try {
    fastify.get('/', {
      preSerialization: [async (req, reply, payload, done) => {}]
    }, async () => ({ ok: true }))
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preSerialization'), 'message should include hook name')
  }
})
