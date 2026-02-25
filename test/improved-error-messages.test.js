'use strict'

const { test, describe } = require('node:test')
const Fastify = require('..')
const {
  FST_ERR_INSTANCE_ALREADY_LISTENING,
  FST_ERR_HOOK_INVALID_ASYNC_HANDLER
} = require('../lib/errors')
const { getServerUrl } = require('./helper')

describe('IMP-1: Enhanced "already started" error messages', () => {
  test('VAL-01: addHook after listen includes actionable guidance', async t => {
    const fastify = Fastify()
    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    t.assert.throws(() => {
      fastify.addHook('onRequest', async (req, reply) => {})
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(err.message.includes('addHook'))
      t.assert.ok(err.message.includes('inside a plugin register function'))
      return true
    })
  })

  test('VAL-02: route registration after listen includes actionable guidance', async t => {
    const fastify = Fastify()
    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    t.assert.throws(() => {
      fastify.get('/test', async () => ({ hello: 'world' }))
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(err.message.includes('route'))
      t.assert.ok(err.message.includes('inside a plugin register function'))
      return true
    })
  })

  test('register after listen includes actionable guidance', async t => {
    const fastify = Fastify()
    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    t.assert.throws(() => {
      fastify.addSchema({ $id: 'test', type: 'object' })
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(err.message.includes('addSchema'))
      t.assert.ok(err.message.includes('inside a plugin register function'))
      return true
    })
  })
})

describe('IMP-2: Hook name in async arity validation errors', () => {
  test('VAL-03: application-level onRequest hook name in error', t => {
    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.addHook('onRequest', async (request, reply, done) => {})
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(err.message.includes('onRequest'))
      return true
    })
  })

  test('VAL-04: route-level preHandler hook name in error', async t => {
    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.get('/', {
        preHandler: [async (request, reply, done) => {}]
      }, async () => ({ ok: true }))
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(err.message.includes('preHandler'))
      return true
    })
  })

  test('VAL-05: onSend 4-param hook name in error', t => {
    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.addHook('onSend', async (request, reply, payload, done) => {})
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(err.message.includes('onSend'))
      return true
    })
  })

  test('preSerialization hook name in error', t => {
    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.addHook('preSerialization', async (request, reply, payload, done) => {})
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(err.message.includes('preSerialization'))
      return true
    })
  })

  test('onReady hook name in error', t => {
    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.addHook('onReady', async (done) => {})
    }, (err) => {
      t.assert.strictEqual(err.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
      t.assert.ok(err.message.includes('onReady'))
      return true
    })
  })
})

describe('IMP-3: No-response warning for async handlers', () => {
  test('VAL-06: warning fires for forgotten reply.send()', async t => {
    const { FSTWRN005 } = require('../lib/warnings')
    FSTWRN005.emitted = false

    const fastify = Fastify()
    const warnings = []

    const originalEmitWarning = process.emitWarning
    process.emitWarning = function (msg, name, code) {
      if (code === 'FSTWRN005') {
        warnings.push(msg)
      } else {
        originalEmitWarning.call(process, msg, name, code)
      }
    }
    t.after(() => { process.emitWarning = originalEmitWarning })

    fastify.get('/forgotten', async (request, reply) => {
      // intentionally returns undefined without calling reply.send()
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const res = await fetch(getServerUrl(fastify) + '/forgotten')
    t.assert.strictEqual(res.status, 200)

    t.assert.ok(warnings.length > 0, 'should have emitted a warning')
    t.assert.ok(warnings[0].includes('GET'), 'warning should include HTTP method')
    t.assert.ok(warnings[0].includes('/forgotten'), 'warning should include route URL')
    t.assert.ok(warnings[0].includes('reply.send()'), 'warning should suggest reply.send()')
  })

  test('VAL-07: no warning when handler returns a value', async t => {
    const fastify = Fastify()
    const warnings = []

    const originalEmitWarning = process.emitWarning
    process.emitWarning = function (msg, name, code) {
      if (code === 'FSTWRN005') {
        warnings.push(msg)
      } else {
        originalEmitWarning.call(process, msg, name, code)
      }
    }
    t.after(() => { process.emitWarning = originalEmitWarning })

    fastify.get('/returns-value', async (request, reply) => {
      return { hello: 'world' }
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const res = await fetch(getServerUrl(fastify) + '/returns-value')
    const body = await res.json()

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(body, { hello: 'world' })
    t.assert.strictEqual(warnings.length, 0, 'should not emit warning when handler returns a value')
  })

  test('VAL-08: no warning when handler calls reply.send() explicitly', async t => {
    const fastify = Fastify()
    const warnings = []

    const originalEmitWarning = process.emitWarning
    process.emitWarning = function (msg, name, code) {
      if (code === 'FSTWRN005') {
        warnings.push(msg)
      } else {
        originalEmitWarning.call(process, msg, name, code)
      }
    }
    t.after(() => { process.emitWarning = originalEmitWarning })

    fastify.get('/explicit-send', async (request, reply) => {
      reply.send({ hello: 'world' })
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const res = await fetch(getServerUrl(fastify) + '/explicit-send')
    const body = await res.json()

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(body, { hello: 'world' })
    t.assert.strictEqual(warnings.length, 0, 'should not emit warning when reply.send() is called')
  })

  test('VAL-09: no warning when handler returns reply object', async t => {
    const fastify = Fastify()
    const warnings = []

    const originalEmitWarning = process.emitWarning
    process.emitWarning = function (msg, name, code) {
      if (code === 'FSTWRN005') {
        warnings.push(msg)
      } else {
        originalEmitWarning.call(process, msg, name, code)
      }
    }
    t.after(() => { process.emitWarning = originalEmitWarning })

    fastify.get('/returns-reply', async (request, reply) => {
      reply.code(200).send({ hello: 'world' })
      return reply
    })

    await fastify.listen({ port: 0 })
    t.after(() => fastify.close())

    const res = await fetch(getServerUrl(fastify) + '/returns-reply')
    const body = await res.json()

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(body, { hello: 'world' })
    t.assert.strictEqual(warnings.length, 0, 'should not emit warning when reply object is returned')
  })
})
