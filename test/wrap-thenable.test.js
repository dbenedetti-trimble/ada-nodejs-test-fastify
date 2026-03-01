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
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.get('/fstwrn005/warn-undefined', async (request, reply) => {
    // intentionally not sending a response
  })

  await new Promise((resolve) => {
    function onWarning (warning) {
      if (warning.code !== 'FSTWRN005') return
      process.removeListener('warning', onWarning)
      t.assert.strictEqual(warning.code, 'FSTWRN005')
      t.assert.ok(warning.message.includes('GET'))
      t.assert.ok(warning.message.includes('/fstwrn005/warn-undefined'))
      resolve()
    }
    process.on('warning', onWarning)
    fastify.inject({ method: 'GET', url: '/fstwrn005/warn-undefined' })
  })
})

test('FSTWRN005: no warning when async handler returns a value', async t => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.get('/fstwrn005/no-warn-value', async (request, reply) => {
    return { hello: 'world' }
  })

  let warningFired = false
  function onWarning (warning) {
    if (warning.code === 'FSTWRN005') {
      warningFired = true
    }
  }
  process.on('warning', onWarning)

  const res = await fastify.inject({ method: 'GET', url: '/fstwrn005/no-warn-value' })
  await new Promise(resolve => setImmediate(resolve))
  process.removeListener('warning', onWarning)

  t.assert.strictEqual(warningFired, false)
  t.assert.strictEqual(res.statusCode, 200)
})

test('FSTWRN005: no warning when async handler calls reply.send() explicitly', async t => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.get('/fstwrn005/no-warn-send', async (request, reply) => {
    reply.send({ hello: 'world' })
  })

  let warningFired = false
  function onWarning (warning) {
    if (warning.code === 'FSTWRN005') {
      warningFired = true
    }
  }
  process.on('warning', onWarning)

  const res = await fastify.inject({ method: 'GET', url: '/fstwrn005/no-warn-send' })
  await new Promise(resolve => setImmediate(resolve))
  process.removeListener('warning', onWarning)

  t.assert.strictEqual(warningFired, false)
  t.assert.strictEqual(res.statusCode, 200)
})

test('FSTWRN005: no warning when async handler returns reply object', async t => {
  t.plan(2)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.get('/fstwrn005/no-warn-reply', async (request, reply) => {
    return reply.code(200).send({ hello: 'world' })
  })

  let warningFired = false
  function onWarning (warning) {
    if (warning.code === 'FSTWRN005') {
      warningFired = true
    }
  }
  process.on('warning', onWarning)

  const res = await fastify.inject({ method: 'GET', url: '/fstwrn005/no-warn-reply' })
  await new Promise(resolve => setImmediate(resolve))
  process.removeListener('warning', onWarning)

  t.assert.strictEqual(warningFired, false)
  t.assert.strictEqual(res.statusCode, 200)
})

test('FSTWRN005: warning fires only once per route (deduplication)', async t => {
  t.plan(1)
  const fastify = Fastify()

  t.after(() => fastify.close())

  fastify.get('/fstwrn005/dedup-route', async (request, reply) => {
    // intentionally not sending a response
  })

  let warningCount = 0
  function onWarning (warning) {
    if (warning.code === 'FSTWRN005' && warning.message.includes('/fstwrn005/dedup-route')) {
      warningCount++
    }
  }
  process.on('warning', onWarning)

  await fastify.inject({ method: 'GET', url: '/fstwrn005/dedup-route' })
  await fastify.inject({ method: 'GET', url: '/fstwrn005/dedup-route' })
  await new Promise(resolve => setImmediate(resolve))
  process.removeListener('warning', onWarning)

  t.assert.strictEqual(warningCount, 1)
})
