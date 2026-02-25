'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const { FSTWRN005 } = require('../lib/warnings')
const wrapThenable = require('../lib/wrap-thenable')

test('should emit warning when async handler returns undefined without sending response', (t, done) => {
  t.plan(6)
  const fastify = Fastify()

  let warningEmitted = false
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      t.assert.strictEqual(warning.name, 'FastifyWarning')
      t.assert.strictEqual(warning.code, FSTWRN005.code)
      t.assert.ok(warning.message.includes('GET'))
      t.assert.ok(warning.message.includes('/no-response'))
      warningEmitted = true
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.get('/no-response', async (request, reply) => {
  })

  fastify.inject({
    method: 'GET',
    url: '/no-response'
  }, (err, response) => {
    t.assert.ifError(err)
    t.assert.ok(warningEmitted)
    done()
  })
})

test('should NOT emit warning when handler returns a value', (t, done) => {
  t.plan(2)
  const fastify = Fastify()

  let warningEmitted = false
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      warningEmitted = true
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.get('/with-return', async (request, reply) => {
    return { ok: true }
  })

  fastify.inject({
    method: 'GET',
    url: '/with-return'
  }, (err, response) => {
    t.assert.ifError(err)
    t.assert.strictEqual(warningEmitted, false)
    done()
  })
})

test('should NOT emit warning when handler explicitly calls reply.send()', (t, done) => {
  t.plan(2)
  const fastify = Fastify()

  let warningEmitted = false
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      warningEmitted = true
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.get('/with-send', async (request, reply) => {
    reply.send({ ok: true })
  })

  fastify.inject({
    method: 'GET',
    url: '/with-send'
  }, (err, response) => {
    t.assert.ifError(err)
    t.assert.strictEqual(warningEmitted, false)
    done()
  })
})

test('should NOT emit warning when handler returns reply', (t, done) => {
  t.plan(2)
  const fastify = Fastify()

  let warningEmitted = false
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      warningEmitted = true
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.get('/return-reply', async (request, reply) => {
    reply.send({ ok: true })
    return reply
  })

  fastify.inject({
    method: 'GET',
    url: '/return-reply'
  }, (err, response) => {
    t.assert.ifError(err)
    t.assert.strictEqual(warningEmitted, false)
    done()
  })
})

test('should include HTTP method and route URL pattern in warning message', (t, done) => {
  t.plan(4)
  const fastify = Fastify()

  let warningMessage = ''
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      warningMessage = warning.message
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.post('/api/users/:id', async (request, reply) => {
  })

  fastify.inject({
    method: 'POST',
    url: '/api/users/123'
  }, (err, response) => {
    t.assert.ifError(err)
    t.assert.ok(warningMessage.includes('POST'))
    t.assert.ok(warningMessage.includes('/api/users/:id'))
    t.assert.ok(warningMessage.includes('resolved without sending a response'))
    done()
  })
})

test('should emit warning only once per route pattern', (t, done) => {
  t.plan(3)
  const fastify = Fastify()

  let warningCount = 0
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      warningCount++
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.get('/dedupe-test', async (request, reply) => {
  })

  fastify.inject({
    method: 'GET',
    url: '/dedupe-test'
  }, (err, response) => {
    t.assert.ifError(err)

    fastify.inject({
      method: 'GET',
      url: '/dedupe-test'
    }, (err, response) => {
      t.assert.ifError(err)
      t.assert.strictEqual(warningCount, 1, 'warning should only fire once')
      done()
    })
  })
})

test('should work correctly with different HTTP methods', (t, done) => {
  t.plan(5)
  const fastify = Fastify()

  const warnings = []
  function onWarning (warning) {
    if (warning.code === FSTWRN005.code) {
      warnings.push(warning.message)
    }
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.removeListener('warning', onWarning)
    wrapThenable.resetWarnedRoutes()
  })

  fastify.put('/method-test', async (request, reply) => {
  })

  fastify.delete('/method-test-2', async (request, reply) => {
  })

  fastify.inject({
    method: 'PUT',
    url: '/method-test'
  }, (err, response) => {
    t.assert.ifError(err)

    fastify.inject({
      method: 'DELETE',
      url: '/method-test-2'
    }, (err, response) => {
      t.assert.ifError(err)
      t.assert.strictEqual(warnings.length, 2)
      t.assert.ok(warnings.some(msg => msg.includes('PUT')))
      t.assert.ok(warnings.some(msg => msg.includes('DELETE')))
      done()
    })
  })
})
