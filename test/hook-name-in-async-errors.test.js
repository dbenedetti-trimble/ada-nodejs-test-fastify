'use strict'

const { test } = require('node:test')
const Fastify = require('../fastify')

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for onRequest', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('onRequest', async (request, reply, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequest'))
    t.assert.strictEqual(e.message, 'Async function for "onRequest" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for preHandler', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('preHandler', async (request, reply, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'))
    t.assert.strictEqual(e.message, 'Async function for "preHandler" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for onSend', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('onSend', async (request, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'))
    t.assert.strictEqual(e.message, 'Async function for "onSend" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for preSerialization', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('preSerialization', async (request, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preSerialization'))
    t.assert.strictEqual(e.message, 'Async function for "preSerialization" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for onError', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('onError', async (request, reply, error, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onError'))
    t.assert.strictEqual(e.message, 'Async function for "onError" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for preParsing', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('preParsing', async (request, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preParsing'))
    t.assert.strictEqual(e.message, 'Async function for "preParsing" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for onRequestAbort', t => {
  const fastify = Fastify()
  try {
    fastify.addHook('onRequestAbort', async (request, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequestAbort'))
    t.assert.strictEqual(e.message, 'Async function for "onRequestAbort" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for route-level onRequest', t => {
  const fastify = Fastify()
  try {
    fastify.get('/', {
      onRequest: [
        async (request, reply, done) => {}
      ]
    }, async (request, reply) => {
      return { hello: 'world' }
    })
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequest'))
    t.assert.strictEqual(e.message, 'Async function for "onRequest" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for route-level preHandler', t => {
  const fastify = Fastify()
  try {
    fastify.get('/', {
      preHandler: [
        async (request, reply, done) => {}
      ]
    }, async (request, reply) => {
      return { hello: 'world' }
    })
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'))
    t.assert.strictEqual(e.message, 'Async function for "preHandler" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for route-level onSend', t => {
  const fastify = Fastify()
  try {
    fastify.get('/', {
      onSend: [
        async (request, reply, payload, done) => {}
      ]
    }, async (request, reply) => {
      return { hello: 'world' }
    })
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'))
    t.assert.strictEqual(e.message, 'Async function for "onSend" hook has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})
