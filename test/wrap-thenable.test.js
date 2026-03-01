'use strict'

const { test } = require('node:test')
const { kReplyHijacked } = require('../lib/symbols')
const wrapThenable = require('../lib/wrap-thenable')
const Reply = require('../lib/reply')
const Fastify = require('../fastify')

test('should resolve immediately when reply[kReplyHijacked] is true', async t => {
  await new Promise(resolve => {
    const reply = {}
    reply[kReplyHijacked] = true
    const thenable = Promise.resolve()
    wrapThenable(thenable, reply)
    resolve()
  })
})

test('should reject immediately when reply[kReplyHijacked] is true', t => {
  t.plan(1)
  const reply = new Reply({}, {}, {})
  reply[kReplyHijacked] = true
  reply.log = {
    error: ({ err }) => {
      t.assert.strictEqual(err.message, 'Reply sent already')
    }
  }

  const thenable = Promise.reject(new Error('Reply sent already'))
  wrapThenable(thenable, reply)
})

test('FSTWRN005: warning fires when async handler returns undefined without reply.send()', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  fastify.get('/no-response', async (request, reply) => {
    // intentionally returns undefined without calling reply.send()
  })

  let warningEmitted = false
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warningEmitted = true
      t.assert.ok(warning.message.includes('GET'))
      t.assert.ok(warning.message.includes('/no-response'))
    }
  }
  process.on('warning', onWarning)
  t.after(() => process.off('warning', onWarning))

  await fastify.inject({ method: 'GET', url: '/no-response' })
  t.assert.ok(warningEmitted, 'FSTWRN005 warning should have been emitted')
})

test('FSTWRN005: no warning when async handler returns a value', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  fastify.get('/with-value', async (request, reply) => {
    return { hello: 'world' }
  })

  let warningEmitted = false
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') warningEmitted = true
  }
  process.on('warning', onWarning)
  t.after(() => process.off('warning', onWarning))

  const res = await fastify.inject({ method: 'GET', url: '/with-value' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(warningEmitted, false, 'FSTWRN005 should not be emitted')
})

test('FSTWRN005: no warning when async handler calls reply.send() explicitly', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  fastify.get('/explicit-send', async (request, reply) => {
    reply.send({ hello: 'world' })
  })

  let warningEmitted = false
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') warningEmitted = true
  }
  process.on('warning', onWarning)
  t.after(() => process.off('warning', onWarning))

  const res = await fastify.inject({ method: 'GET', url: '/explicit-send' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(warningEmitted, false, 'FSTWRN005 should not be emitted')
})

test('FSTWRN005: no warning when async handler returns reply object', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  fastify.get('/return-reply', async (request, reply) => {
    reply.code(200).send({ hello: 'world' })
    return reply
  })

  let warningEmitted = false
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') warningEmitted = true
  }
  process.on('warning', onWarning)
  t.after(() => process.off('warning', onWarning))

  const res = await fastify.inject({ method: 'GET', url: '/return-reply' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(warningEmitted, false, 'FSTWRN005 should not be emitted')
})

test('FSTWRN005: warning fires only once per route pattern', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  fastify.get('/dedup-route', async (request, reply) => {
    // intentionally returns undefined
  })

  let warnCount = 0
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005' && warning.message.includes('/dedup-route')) {
      warnCount++
    }
  }
  process.on('warning', onWarning)
  t.after(() => process.off('warning', onWarning))

  await fastify.inject({ method: 'GET', url: '/dedup-route' })
  await fastify.inject({ method: 'GET', url: '/dedup-route' })
  await new Promise(resolve => setImmediate(resolve))
  t.assert.strictEqual(warnCount, 1, 'warning should fire only once per route')
})
