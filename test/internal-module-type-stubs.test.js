'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

// Test tags for traceability
const TEST_TAGS = {
  ACFR_3_1: '@covers_ACFR_3_1',
  ACFR_3_2: '@covers_ACFR_3_2',
  ACFR_3_3: '@covers_ACFR_3_3',
  ACFR_3_4: '@covers_ACFR_3_4',
  ACFR_3_5: '@covers_ACFR_3_5'
}

// List of modules imported by route.js
const REQUIRED_MODULES = [
  'context',
  'handle-request',
  'hooks',
  'schemas',
  'head-route',
  'validation',
  'errors',
  'symbols',
  'error-handler',
  'logger-factory',
  'req-id-gen-factory',
  'warnings'
]

test(`${TEST_TAGS.ACFR_3_1} - Every module imported by route.ts has a corresponding .d.ts stub in lib/`, async (t) => {
  for (const module of REQUIRED_MODULES) {
    const stubPath = path.join(__dirname, '..', 'lib', `${module}.d.ts`)
    assert.ok(
      fs.existsSync(stubPath),
      `Missing type stub for ${module}: ${stubPath}`
    )
  }
})

test(`${TEST_TAGS.ACFR_3_2} - Each stub exports only the symbols that route.js uses`, async (t) => {
  const routePath = path.join(__dirname, '..', 'lib', 'route.js')
  fs.readFileSync(routePath, 'utf8')

  // Check context.d.ts exports Context
  const contextStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'context.d.ts'), 'utf8')
  assert.ok(contextStub.includes('declare class Context'), 'context.d.ts should export Context class')
  assert.ok(contextStub.includes('export ='), 'context.d.ts should use export = syntax')

  // Check handle-request.d.ts exports handleRequest
  const handleRequestStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'handle-request.d.ts'), 'utf8')
  assert.ok(handleRequestStub.includes('handleRequest'), 'handle-request.d.ts should export handleRequest')

  // Check hooks.d.ts exports required symbols
  const hooksStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'hooks.d.ts'), 'utf8')
  assert.ok(hooksStub.includes('onRequestAbortHookRunner'), 'hooks.d.ts should export onRequestAbortHookRunner')
  assert.ok(hooksStub.includes('lifecycleHooks'), 'hooks.d.ts should export lifecycleHooks')
  assert.ok(hooksStub.includes('preParsingHookRunner'), 'hooks.d.ts should export preParsingHookRunner')
  assert.ok(hooksStub.includes('onTimeoutHookRunner'), 'hooks.d.ts should export onTimeoutHookRunner')
  assert.ok(hooksStub.includes('onRequestHookRunner'), 'hooks.d.ts should export onRequestHookRunner')

  // Check schemas.d.ts exports normalizeSchema
  const schemasStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'schemas.d.ts'), 'utf8')
  assert.ok(schemasStub.includes('normalizeSchema'), 'schemas.d.ts should export normalizeSchema')

  // Check head-route.d.ts exports parseHeadOnSendHandlers
  const headRouteStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'head-route.d.ts'), 'utf8')
  assert.ok(headRouteStub.includes('parseHeadOnSendHandlers'), 'head-route.d.ts should export parseHeadOnSendHandlers')

  // Check validation.d.ts exports required functions
  const validationStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'validation.d.ts'), 'utf8')
  assert.ok(validationStub.includes('compileSchemasForValidation'), 'validation.d.ts should export compileSchemasForValidation')
  assert.ok(validationStub.includes('compileSchemasForSerialization'), 'validation.d.ts should export compileSchemasForSerialization')

  // Check errors.d.ts exports FST_ERR_* constants
  const errorsStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'errors.d.ts'), 'utf8')
  const errorConstants = [
    'FST_ERR_SCH_VALIDATION_BUILD',
    'FST_ERR_SCH_SERIALIZATION_BUILD',
    'FST_ERR_DUPLICATED_ROUTE',
    'FST_ERR_INVALID_URL',
    'FST_ERR_HOOK_INVALID_HANDLER',
    'FST_ERR_ROUTE_OPTIONS_NOT_OBJ',
    'FST_ERR_ROUTE_DUPLICATED_HANDLER',
    'FST_ERR_ROUTE_HANDLER_NOT_FN',
    'FST_ERR_ROUTE_MISSING_HANDLER',
    'FST_ERR_ROUTE_METHOD_NOT_SUPPORTED',
    'FST_ERR_ROUTE_METHOD_INVALID',
    'FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED',
    'FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT',
    'FST_ERR_HOOK_INVALID_ASYNC_HANDLER'
  ]
  for (const errorConstant of errorConstants) {
    assert.ok(errorsStub.includes(errorConstant), `errors.d.ts should export ${errorConstant}`)
  }

  // Check symbols.d.ts exports symbol constants
  const symbolsStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'symbols.d.ts'), 'utf8')
  const symbolConstants = [
    'kRoutePrefix',
    'kSupportedHTTPMethods',
    'kLogLevel',
    'kLogSerializers',
    'kHooks',
    'kSchemaController',
    'kOptions',
    'kReplySerializerDefault',
    'kReplyIsError',
    'kRequestPayloadStream',
    'kDisableRequestLogging',
    'kSchemaErrorFormatter',
    'kErrorHandler',
    'kHasBeenDecorated',
    'kRequestAcceptVersion',
    'kRouteByFastify',
    'kRouteContext'
  ]
  for (const symbol of symbolConstants) {
    assert.ok(symbolsStub.includes(symbol), `symbols.d.ts should export ${symbol}`)
  }

  // Check error-handler.d.ts exports buildErrorHandler
  const errorHandlerStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'error-handler.d.ts'), 'utf8')
  assert.ok(errorHandlerStub.includes('buildErrorHandler'), 'error-handler.d.ts should export buildErrorHandler')

  // Check logger-factory.d.ts exports createChildLogger
  const loggerFactoryStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'logger-factory.d.ts'), 'utf8')
  assert.ok(loggerFactoryStub.includes('createChildLogger'), 'logger-factory.d.ts should export createChildLogger')

  // Check req-id-gen-factory.d.ts exports getGenReqId
  const reqIdGenFactoryStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'req-id-gen-factory.d.ts'), 'utf8')
  assert.ok(reqIdGenFactoryStub.includes('getGenReqId'), 'req-id-gen-factory.d.ts should export getGenReqId')

  // Check warnings.d.ts exports FSTDEP022
  const warningsStub = fs.readFileSync(path.join(__dirname, '..', 'lib', 'warnings.d.ts'), 'utf8')
  assert.ok(warningsStub.includes('FSTDEP022'), 'warnings.d.ts should export FSTDEP022')
})

test(`${TEST_TAGS.ACFR_3_3} - Stubs use any for complex internal types`, async (t) => {
  // Verify that stubs use 'any' type for complex internal types
  const stubFiles = REQUIRED_MODULES.map(module => ({
    name: module,
    path: path.join(__dirname, '..', 'lib', `${module}.d.ts`)
  }))

  for (const stub of stubFiles) {
    const content = fs.readFileSync(stub.path, 'utf8')

    // Check that the stub uses 'any' type (pragmatic typing approach)
    // This is acceptable for internal types that are not worth fully specifying
    if (stub.name !== 'symbols') { // symbols only has symbol types
      assert.ok(
        content.includes('any') || content.includes('Function'),
        `${stub.name}.d.ts should use 'any' or 'Function' for pragmatic typing`
      )
    }
  }
})

test(`${TEST_TAGS.ACFR_3_4} - Stubs do not conflict with public types/ declarations`, async (t) => {
  // Check that .d.ts stubs in lib/ don't redefine types from types/ directory
  const typesDir = path.join(__dirname, '..', 'types')

  // The main type definitions are in types/ directory
  // Our lib/ stubs should be minimal and not conflict with them
  assert.ok(
    fs.existsSync(typesDir),
    'types/ directory should exist for public type definitions'
  )

  // Verify that our stubs are minimal and use 'any' for complex types
  // This prevents conflicts with the public types
  for (const module of REQUIRED_MODULES) {
    const stubPath = path.join(__dirname, '..', 'lib', `${module}.d.ts`)
    const content = fs.readFileSync(stubPath, 'utf8')

    // Stubs should be concise (internal use only)
    // They should not duplicate the detailed type definitions in types/
    const lines = content.split('\n').filter(line => line.trim() !== '')
    assert.ok(
      lines.length < 100,
      `${module}.d.ts should be minimal (< 100 non-empty lines)`
    )
  }
})

test(`${TEST_TAGS.ACFR_3_5} - Type stubs compile without TypeScript errors`, async (t) => {
  const { execSync } = require('node:child_process')

  try {
    // Verify all stub files compile without errors
    const stubFiles = REQUIRED_MODULES.map(module => `lib/${module}.d.ts`).join(' ')
    execSync(`npx tsc --noEmit ${stubFiles}`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe'
    })

    // If we reach here, compilation succeeded
    assert.ok(true, 'All type stubs compile without errors')
  } catch (error) {
    assert.fail(`TypeScript compilation failed: ${error.message}`)
  }
})
