'use strict'

const { test, describe } = require('node:test')
const Fastify = require('../fastify')
const { getServerUrl } = require('./helper')

process.removeAllListeners('warning')

describe('IMP-1: Enhanced "already started" error messages', () => {
  test('addHook after listen includes guidance', async (t) => {
    t.plan(3)
    const fastify = Fastify()
    fastify.get('/', async () => 'ok')
    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    try {
      fastify.addHook('onRequest', async () => {})
      t.assert.fail('should have thrown')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(e.message.includes('addHook'))
      t.assert.ok(e.message.includes('inside a plugin register function'))
    }
  })

  test('route registration after listen includes guidance', async (t) => {
    t.plan(3)
    const fastify = Fastify()
    fastify.get('/', async () => 'ok')
    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    try {
      fastify.get('/new', async () => 'ok')
      t.assert.fail('should have thrown')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(e.message.includes('Cannot add route'))
      t.assert.ok(e.message.includes('inside a plugin register function'))
    }
  })

  test('setErrorHandler after listen includes guidance', async (t) => {
    t.plan(3)
    const fastify = Fastify()
    fastify.get('/', async () => 'ok')
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
})

describe('IMP-2: Hook name in async arity validation errors', () => {
  test('onRequest hook name in error (app-level)', (t) => {
    t.plan(2)
    const fastify = Fastify()
    try {
      fastify.addHook('onRequest', async (req, reply, done) => {})
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(e.message.includes('"onRequest"'))
    }
  })

  test('preSerialization hook name in error (app-level)', (t) => {
    t.plan(2)
    const fastify = Fastify()
    try {
      fastify.addHook('preSerialization', async (req, reply, payload, done) => {})
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(e.message.includes('"preSerialization"'))
    }
  })

  test('onSend hook name in error (app-level)', (t) => {
    t.plan(2)
    const fastify = Fastify()
    try {
      fastify.addHook('onSend', async (req, reply, payload, done) => {})
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(e.message.includes('"onSend"'))
    }
  })

  test('preHandler hook name in error (route-level)', (t) => {
    t.plan(2)
    const fastify = Fastify()
    try {
      fastify.get('/', {
        preHandler: [async (req, reply, done) => {}]
      }, async () => 'ok')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(e.message.includes('"preHandler"'))
    }
  })

  test('onSend hook name in error (route-level)', (t) => {
    t.plan(2)
    const fastify = Fastify()
    try {
      fastify.get('/', {
        onSend: [async (req, reply, payload, done) => {}]
      }, async () => 'ok')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(e.message.includes('"onSend"'))
    }
  })
})

describe('IMP-3: No-response warning', () => {
  test('warning fires when async handler returns undefined without reply.send()', async (t) => {
    t.plan(2)
    const fastify = Fastify()

    fastify.get('/hang', async (request, reply) => {
      // deliberately returns undefined without sending response
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const warnings = []
    const onWarning = (w) => { warnings.push(w) }
    process.on('warning', onWarning)
    t.after(() => process.removeListener('warning', onWarning))

    const url = getServerUrl(fastify)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)

    try {
      await fetch(`${url}/hang`, { signal: controller.signal })
    } catch {
      // expected — request hangs and we abort it
    } finally {
      clearTimeout(timeout)
    }

    await new Promise(resolve => setTimeout(resolve, 100))

    const w = warnings.find(w => w.code === 'FSTWRN005')
    t.assert.ok(w, 'FSTWRN005 warning should be emitted')
    t.assert.ok(w.message.includes('GET') && w.message.includes('/hang'))
  })

  test('no warning when handler returns a value', async (t) => {
    t.plan(2)
    const fastify = Fastify()

    fastify.get('/ok', async () => {
      return { hello: 'world' }
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const warnings = []
    const onWarning = (w) => { warnings.push(w) }
    process.on('warning', onWarning)
    t.after(() => process.removeListener('warning', onWarning))

    const url = getServerUrl(fastify)
    const res = await fetch(`${url}/ok`)
    const body = await res.json()

    t.assert.deepStrictEqual(body, { hello: 'world' })
    t.assert.strictEqual(warnings.filter(w => w.code === 'FSTWRN005').length, 0)
  })

  test('no warning when handler calls reply.send() explicitly', async (t) => {
    t.plan(2)
    const fastify = Fastify()

    fastify.get('/send', async (request, reply) => {
      reply.send({ hello: 'world' })
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const warnings = []
    const onWarning = (w) => { warnings.push(w) }
    process.on('warning', onWarning)
    t.after(() => process.removeListener('warning', onWarning))

    const url = getServerUrl(fastify)
    const res = await fetch(`${url}/send`)
    const body = await res.json()

    t.assert.deepStrictEqual(body, { hello: 'world' })
    t.assert.strictEqual(warnings.filter(w => w.code === 'FSTWRN005').length, 0)
  })

  test('no warning when handler returns reply object', async (t) => {
    t.plan(1)
    const fastify = Fastify()

    fastify.get('/reply', async (request, reply) => {
      reply.code(200).send({ data: 'ok' })
      return reply
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const warnings = []
    const onWarning = (w) => { warnings.push(w) }
    process.on('warning', onWarning)
    t.after(() => process.removeListener('warning', onWarning))

    const url = getServerUrl(fastify)
    await fetch(`${url}/reply`)

    t.assert.strictEqual(warnings.filter(w => w.code === 'FSTWRN005').length, 0)
  })
})
