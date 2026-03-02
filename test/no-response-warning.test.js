'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const { FSTWRN005 } = require('../lib/warnings')

test('FSTWRN005 - warning fires when async handler returns undefined without reply.send()', async t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.get('/missing-send', async (request, reply) => {
    // intentionally no return and no reply.send()
  })

  const warnings = []
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    FSTWRN005.emitted = false
    fastify.close()
  })

  await fastify.ready()
  await fastify.inject({ method: 'GET', url: '/missing-send' })

  await new Promise(resolve => setTimeout(resolve, 100))

  t.assert.strictEqual(warnings.length, 1)
  t.assert.ok(warnings[0].message.includes('GET'))
  t.assert.ok(warnings[0].message.includes('/missing-send'))
})

test('FSTWRN005 - no warning when handler returns a value', async t => {
  t.plan(2)

  const fastify = Fastify()
  fastify.get('/returns-value', async (request, reply) => {
    return { hello: 'world' }
  })

  const warnings = []
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    FSTWRN005.emitted = false
    fastify.close()
  })

  await fastify.ready()
  const res = await fastify.inject({ method: 'GET', url: '/returns-value' })

  await new Promise(resolve => setTimeout(resolve, 100))

  t.assert.strictEqual(warnings.length, 0)
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

test('FSTWRN005 - no warning when handler calls reply.send() explicitly', async t => {
  t.plan(2)

  const fastify = Fastify()
  fastify.get('/explicit-send', async (request, reply) => {
    reply.send({ hello: 'world' })
  })

  const warnings = []
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    FSTWRN005.emitted = false
    fastify.close()
  })

  await fastify.ready()
  const res = await fastify.inject({ method: 'GET', url: '/explicit-send' })

  await new Promise(resolve => setTimeout(resolve, 100))

  t.assert.strictEqual(warnings.length, 0)
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

test('FSTWRN005 - no warning when handler returns reply object', async t => {
  t.plan(1)

  const fastify = Fastify()
  fastify.get('/returns-reply', async (request, reply) => {
    reply.code(200).send({ hello: 'world' })
    return reply
  })

  const warnings = []
  const onWarning = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    FSTWRN005.emitted = false
    fastify.close()
  })

  await fastify.ready()
  await fastify.inject({ method: 'GET', url: '/returns-reply' })

  await new Promise(resolve => setTimeout(resolve, 100))

  t.assert.strictEqual(warnings.length, 0)
})
