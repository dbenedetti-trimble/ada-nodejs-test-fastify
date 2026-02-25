'use strict'

const { test } = require('node:test')
const path = require('node:path')
const fs = require('node:fs')

test('Technical Constraints Validation', async (t) => {
  await t.test('@covers_ACTC_1_1 All error changes use @fastify/error createError pattern', async (t) => {
    t.plan(3)

    const errorsFilePath = path.join(__dirname, '..', 'lib', 'errors.js')
    const errorsContent = fs.readFileSync(errorsFilePath, 'utf8')

    t.assert.ok(
      errorsContent.includes("const createError = require('@fastify/error')"),
      'errors.js imports createError from @fastify/error'
    )

    t.assert.ok(
      errorsContent.includes('FST_ERR_INSTANCE_ALREADY_LISTENING: createError('),
      'FST_ERR_INSTANCE_ALREADY_LISTENING uses createError pattern'
    )

    t.assert.ok(
      errorsContent.includes('FST_ERR_HOOK_INVALID_ASYNC_HANDLER: createError('),
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER uses createError pattern'
    )
  })

  await t.test('@covers_ACTC_2_1 Error codes remain unchanged', async (t) => {
    t.plan(4)

    const errors = require('../lib/errors')

    t.assert.ok(
      errors.FST_ERR_INSTANCE_ALREADY_LISTENING,
      'FST_ERR_INSTANCE_ALREADY_LISTENING error exists'
    )

    t.assert.ok(
      errors.FST_ERR_HOOK_INVALID_ASYNC_HANDLER,
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER error exists'
    )

    const err1 = new errors.FST_ERR_INSTANCE_ALREADY_LISTENING('testOperation')
    t.assert.strictEqual(
      err1.code,
      'FST_ERR_INSTANCE_ALREADY_LISTENING',
      'FST_ERR_INSTANCE_ALREADY_LISTENING code is unchanged'
    )

    const err2 = new errors.FST_ERR_HOOK_INVALID_ASYNC_HANDLER('testHook')
    t.assert.strictEqual(
      err2.code,
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER',
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER code is unchanged'
    )
  })

  await t.test('@covers_ACTC_3_1 All tests use node:test via borp', async (t) => {
    t.plan(6)

    const testDir = path.join(__dirname)
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

    t.assert.ok(
      packageJson.devDependencies.borp,
      'borp is listed in devDependencies'
    )

    t.assert.ok(
      !packageJson.devDependencies.jest,
      'jest is not in devDependencies'
    )

    t.assert.ok(
      !packageJson.devDependencies.mocha,
      'mocha is not in devDependencies'
    )

    const newTestFiles = [
      'already-started-enhanced-errors.test.js',
      'hook-async-arity-error-names.test.js',
      'route-handler-no-response-warning.test.js'
    ]

    for (const testFile of newTestFiles) {
      const testFilePath = path.join(testDir, testFile)
      if (fs.existsSync(testFilePath)) {
        const content = fs.readFileSync(testFilePath, 'utf8')
        t.assert.ok(
          content.includes("require('node:test')") || content.includes('from "node:test"') || content.includes("from 'node:test'"),
          `${testFile} uses node:test`
        )
      }
    }
  })

  await t.test('@covers_ACTC_4_1 TypeScript type definitions updated if message signatures change', async (t) => {
    t.plan(3)

    const typeDefsPath = path.join(__dirname, '..', 'types', 'errors.d.ts')
    const typeDefsContent = fs.readFileSync(typeDefsPath, 'utf8')

    t.assert.ok(
      typeDefsContent.includes('FST_ERR_INSTANCE_ALREADY_LISTENING'),
      'FST_ERR_INSTANCE_ALREADY_LISTENING is in type definitions'
    )

    t.assert.ok(
      typeDefsContent.includes('FST_ERR_HOOK_INVALID_ASYNC_HANDLER'),
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER is in type definitions'
    )

    const errors = require('../lib/errors')
    const testErr1 = new errors.FST_ERR_INSTANCE_ALREADY_LISTENING('testOp')
    const testErr2 = new errors.FST_ERR_HOOK_INVALID_ASYNC_HANDLER('testHook')

    t.assert.ok(
      typeof testErr1.message === 'string' && typeof testErr2.message === 'string',
      'Error constructors accept string parameters and produce valid error messages'
    )
  })

  await t.test('@validation_test Verify error message signatures match implementation', async (t) => {
    t.plan(4)

    const errors = require('../lib/errors')

    const err1 = new errors.FST_ERR_INSTANCE_ALREADY_LISTENING('addHook')
    t.assert.ok(
      err1.message.includes('addHook'),
      'FST_ERR_INSTANCE_ALREADY_LISTENING includes operation name in message'
    )
    t.assert.ok(
      err1.message.includes('plugin register function'),
      'FST_ERR_INSTANCE_ALREADY_LISTENING includes guidance about plugin register functions'
    )

    const err2 = new errors.FST_ERR_HOOK_INVALID_ASYNC_HANDLER('onRequest')
    t.assert.ok(
      err2.message.includes('onRequest'),
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name in message'
    )
    t.assert.ok(
      err2.message.includes('Async function'),
      'FST_ERR_HOOK_INVALID_ASYNC_HANDLER message describes async function issue'
    )
  })

  await t.test('@validation_test Verify hook name is passed in fastify.js and lib/route.js', async (t) => {
    t.plan(2)

    const fastifyFilePath = path.join(__dirname, '..', 'fastify.js')
    const fastifyContent = fs.readFileSync(fastifyFilePath, 'utf8')

    const routeFilePath = path.join(__dirname, '..', 'lib', 'route.js')
    const routeContent = fs.readFileSync(routeFilePath, 'utf8')

    t.assert.ok(
      fastifyContent.includes('FST_ERR_HOOK_INVALID_ASYNC_HANDLER(name)') ||
      fastifyContent.includes('FST_ERR_HOOK_INVALID_ASYNC_HANDLER(hook)'),
      'fastify.js passes hook name to FST_ERR_HOOK_INVALID_ASYNC_HANDLER'
    )

    t.assert.ok(
      routeContent.includes('FST_ERR_HOOK_INVALID_ASYNC_HANDLER(hook)'),
      'lib/route.js passes hook name to FST_ERR_HOOK_INVALID_ASYNC_HANDLER'
    )
  })

  await t.test('@validation_test Verify warning system uses process-warning pattern', async (t) => {
    t.plan(2)

    const warningsFilePath = path.join(__dirname, '..', 'lib', 'warnings.js')
    const warningsContent = fs.readFileSync(warningsFilePath, 'utf8')

    t.assert.ok(
      warningsContent.includes("const { createWarning } = require('process-warning')"),
      'warnings.js uses process-warning module'
    )

    t.assert.ok(
      warningsContent.includes('FSTWRN005'),
      'FSTWRN005 warning code exists for route handler no response'
    )
  })
})
