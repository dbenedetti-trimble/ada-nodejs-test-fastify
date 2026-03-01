'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const { FSTWRN005 } = require('../lib/warnings')

// VAL-01: Enhanced "already started" error for addHook
test('VAL-01: already started error for addHook includes guidance', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.get('/', async () => 'ok')
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.addHook('onRequest', async (req, reply) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('addHook'), 'message should include "addHook"')
    t.assert.ok(e.message.includes('plugin'), 'message should include guidance about plugin')
  }
})

// VAL-02: Enhanced "already started" error for route registration
test('VAL-02: already started error for route registration includes guidance', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.get('/', async () => 'ok')
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  try {
    fastify.get('/test', async () => 'test')
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
    t.assert.ok(e.message.includes('route'), 'message should include route method name')
    t.assert.ok(e.message.includes('plugin'), 'message should include guidance about plugin')
  }
})

// VAL-03: Hook name in async arity error for application hook (onRequest)
test('VAL-03: FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for onRequest', t => {
  t.plan(3)
  const fastify = Fastify()

  try {
    fastify.addHook('onRequest', async (req, reply, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequest'), 'message should include hook name')
    t.assert.ok(e.message.includes("'done'"), 'message should mention done argument')
  }
})

// VAL-04: Hook name in async arity error for route-level hook (preHandler)
test('VAL-04: FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for route-level preHandler', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.get('/', {
      preHandler: [async (request, reply, done) => {}]
    }, async () => 'ok')
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'), 'message should include "preHandler"')
  }
})

// VAL-05: Hook name in async arity error for onSend (4-param hook)
test('VAL-05: FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for onSend', t => {
  t.plan(3)
  const fastify = Fastify()

  try {
    fastify.addHook('onSend', async (req, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'), 'message should include hook name "onSend"')
    t.assert.ok(e.message.includes("'done'"), 'message should mention done argument')
  }
})

// VAL-06: No-response warning fires for forgotten reply.send()
test('VAL-06: warning fires when async handler returns undefined without sending', async t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/forgotten', async (request, reply) => {
    // intentionally does not send a response
  })

  await fastify.ready()

  const warnings = []
  function onWarning (warning) {
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

  await fastify.inject({ method: 'GET', url: '/forgotten' })

  t.assert.strictEqual(warnings.length, 1, 'warning should fire once')
  t.assert.ok(
    warnings[0].message.includes('GET') && warnings[0].message.includes('/forgotten'),
    'warning should include method and URL'
  )
})

// VAL-07: No warning when handler returns a value
test('VAL-07: no warning when handler returns a value', async t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/ok', async () => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const warnings = []
  function onWarning (warning) {
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

  const res = await fastify.inject({ method: 'GET', url: '/ok' })

  t.assert.strictEqual(warnings.length, 0, 'no warning should fire')
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

// VAL-08: No warning when handler calls reply.send() explicitly
test('VAL-08: no warning when handler calls reply.send() explicitly', async t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/explicit', async (request, reply) => {
    reply.send({ hello: 'world' })
  })

  await fastify.ready()

  const warnings = []
  function onWarning (warning) {
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

  const res = await fastify.inject({ method: 'GET', url: '/explicit' })

  t.assert.strictEqual(warnings.length, 0, 'no warning should fire')
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

// VAL-09: No warning when handler returns reply object
test('VAL-09: no warning when handler returns reply object', async t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/return-reply', async (request, reply) => {
    return reply.code(200).send({ data: 'ok' })
  })

  await fastify.ready()

  const warnings = []
  function onWarning (warning) {
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

  const res = await fastify.inject({ method: 'GET', url: '/return-reply' })

  t.assert.strictEqual(warnings.length, 0, 'no warning should fire')
  t.assert.deepStrictEqual(JSON.parse(res.body), { data: 'ok' })
})
