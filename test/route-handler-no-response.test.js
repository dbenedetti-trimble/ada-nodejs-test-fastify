'use strict'

const { test } = require('node:test')
const Fastify = require('..')

test('Warning emitted when async handler returns undefined without sending @covers_ACFR_3_1 @covers_ACFR_3_2 @covers_ACFR_3_3 @covers_ACFR_3_8 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    warnings.push(warning)
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    // BUG: forgot to return or call reply.send()
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 1)
  t.assert.strictEqual(warnings[0].code, 'FSTWRN005')
  t.assert.ok(warnings[0].message.includes('GET'))
  t.assert.ok(warnings[0].message.includes('/test'))
  t.assert.ok(warnings[0].message.includes('resolved without sending a response'))

  await fastify.close()
})

test('Warning includes HTTP method and route URL pattern @covers_ACFR_3_3 @covers_ACFR_3_8 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.post('/users/:id', async (request, reply) => {
    // BUG: forgot to return or call reply.send()
  })

  await fastify.inject({ method: 'POST', url: '/users/123' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 1)
  t.assert.ok(warnings[0].message.includes('POST'))
  t.assert.ok(warnings[0].message.includes('/users/:id'))

  await fastify.close()
})

test('No warning when handler returns non-undefined value @covers_ACFR_3_4 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(response.body), { hello: 'world' })

  await fastify.close()
})

test('No warning when handler explicitly calls reply.send() @covers_ACFR_3_5 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    reply.send({ hello: 'world' })
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(response.body), { hello: 'world' })

  await fastify.close()
})

test('No warning when handler returns reply object @covers_ACFR_3_6 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    return reply.send({ hello: 'world' })
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(response.body), { hello: 'world' })

  await fastify.close()
})

test('Warning fires only once per route @covers_ACFR_3_7 @unit_test', async t => {
  const wrapThenable = require('../lib/wrap-thenable')
  const warnedRoutes = wrapThenable[Symbol.for('internals')].warnedRoutes
  warnedRoutes.clear()

  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    // BUG: forgot to return or call reply.send()
  })

  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 1)

  await fastify.close()
})

test('No warning when handler returns explicit null @covers_ACFR_3_4 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    return null
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)

  await fastify.close()
})

test('No warning when handler returns empty string @covers_ACFR_3_4 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    return ''
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)

  await fastify.close()
})

test('No warning when handler returns number 0 @covers_ACFR_3_4 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    return 0
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)

  await fastify.close()
})

test('No warning when handler returns boolean false @covers_ACFR_3_4 @covers_ACFR_3_9 @unit_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    return false
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)

  await fastify.close()
})

test('Warning is in FASTIFY_WARNINGS object @covers_ACFR_3_1 @covers_ACFR_3_10 @unit_test', async t => {
  const warnings = require('../lib/warnings')

  t.assert.ok(warnings.FSTWRN005)
  t.assert.strictEqual(typeof warnings.FSTWRN005, 'function')
})

test('Buggy handler example from spec (happy path bug) @covers_ACFR_3_2 @covers_ACFR_3_8 @integration_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const db = {
    getUser: async (id) => {
      if (id === '404') return null
      return { id, name: 'Test User' }
    }
  }

  const fastify = Fastify()
  fastify.get('/users/:id', async (request, reply) => {
    const user = await db.getUser(request.params.id)
    if (!user) {
      reply.code(404).send({ error: 'Not found' })
    }
    // BUG: forgot to return user or call reply.send(user)
  })

  await fastify.inject({ method: 'GET', url: '/users/404' })
  t.assert.strictEqual(warnings.length, 0, 'No warning for error path')

  await fastify.inject({ method: 'GET', url: '/users/123' })
  t.assert.strictEqual(warnings.length, 1, 'Warning for happy path bug')
  t.assert.ok(warnings[0].message.includes('GET'))
  t.assert.ok(warnings[0].message.includes('/users/:id'))

  process.removeListener('warning', warningHandler)

  await fastify.close()
})

test('No warning when handler calls reply.send() before async operation @covers_ACFR_3_5 @covers_ACFR_3_9 @integration_test', async t => {
  const warnings = []
  const warningHandler = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warnings.push(warning)
    }
  }
  process.on('warning', warningHandler)

  const fastify = Fastify()
  fastify.get('/test', async (request, reply) => {
    reply.code(200).send({ hello: 'world' })
  })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  process.removeListener('warning', warningHandler)

  t.assert.strictEqual(warnings.length, 0)
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(JSON.parse(response.body), { hello: 'world' })

  await fastify.close()
})
