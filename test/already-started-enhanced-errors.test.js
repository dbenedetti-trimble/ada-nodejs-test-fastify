'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const {
  FST_ERR_INSTANCE_ALREADY_LISTENING
} = require('../lib/errors')

test('Enhanced error messages for calls after instance already started', async (t) => {
  await t.test('@covers_ACFR_1_1 @covers_ACFR_1_5 addHook after listen shows enhanced error message', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    await fastify.listen({ port: 0 })
    t.after(() => { fastify.close() })

    try {
      fastify.addHook('onRequest', (request, reply, done) => {
        done()
      })
      t.assert.fail('Should have thrown an error')
    } catch (error) {
      t.assert.strictEqual(error.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(error.message.includes('Move this call inside a plugin register function'))
      t.assert.ok(error.message.includes('addHook'))
    }
  })

  await t.test('@covers_ACFR_1_1 @covers_ACFR_1_5 route shorthand (.get) after listen shows enhanced error message', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    await fastify.listen({ port: 0 })
    t.after(() => { fastify.close() })

    try {
      fastify.get('/test', (request, reply) => {
        reply.send({ hello: 'world' })
      })
      t.assert.fail('Should have thrown an error')
    } catch (error) {
      t.assert.strictEqual(error.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(error.message.includes('Move this call inside a plugin register function'))
      t.assert.ok(error.message.includes('route'))
    }
  })

  await t.test('@covers_ACFR_1_5 setErrorHandler after listen shows enhanced error message', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    await fastify.listen({ port: 0 })
    t.after(() => { fastify.close() })

    try {
      fastify.setErrorHandler((error, request, reply) => {
        reply.send({ error: error.message })
      })
      t.assert.fail('Should have thrown an error')
    } catch (error) {
      t.assert.strictEqual(error.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(error.message.includes('Move this call inside a plugin register function'))
      t.assert.ok(error.message.includes('setErrorHandler'))
    }
  })

  await t.test('@covers_ACFR_1_2 error code remains FST_ERR_INSTANCE_ALREADY_LISTENING', async (t) => {
    t.plan(1)

    const fastify = Fastify()

    await fastify.listen({ port: 0 })
    t.after(() => { fastify.close() })

    t.assert.throws(() => fastify.addHook('onRequest', () => {}),
      new FST_ERR_INSTANCE_ALREADY_LISTENING('Cannot call "addHook"!'))
  })

  await t.test('@covers_ACFR_1_1 error message includes actionable guidance text', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    await fastify.listen({ port: 0 })
    t.after(() => { fastify.close() })

    try {
      fastify.addHook('onRequest', () => {})
      t.assert.fail('Should have thrown an error')
    } catch (error) {
      t.assert.ok(error.message.includes('Move this call inside a plugin'))
      t.assert.ok(error.message.includes('before the server starts'))
    }
  })

  await t.test('@covers_ACFR_1_1 various operations show enhanced messages', async (t) => {
    const operations = [
      { fn: (app) => app.addHook('onRequest', () => {}), name: 'addHook' },
      { fn: (app) => app.get('/test', () => {}), name: 'route' },
      { fn: (app) => app.addSchema({ $id: 'test', type: 'object' }), name: 'addSchema' },
      { fn: (app) => app.setNotFoundHandler(() => {}), name: 'setNotFoundHandler' },
      { fn: (app) => app.setErrorHandler(() => {}), name: 'setErrorHandler' }
    ]

    t.plan(operations.length * 2)

    for (const operation of operations) {
      const fastify = Fastify()
      await fastify.listen({ port: 0 })

      try {
        operation.fn(fastify)
        t.assert.fail(`Should have thrown an error for ${operation.name}`)
      } catch (error) {
        t.assert.strictEqual(error.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING',
          `Error code should be correct for ${operation.name}`)
        t.assert.ok(error.message.includes('Move this call inside a plugin register function'),
          `Error message should include guidance for ${operation.name}`)
      } finally {
        await fastify.close()
      }
    }
  })
})
