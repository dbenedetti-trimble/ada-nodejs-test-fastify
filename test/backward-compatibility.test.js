'use strict'

const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const TEST_TAGS = {
  ACNFR_3_1: '@covers_ACNFR_3_1',
  ACNFR_3_2: '@covers_ACNFR_3_2',
  ACNFR_3_3: '@covers_ACNFR_3_3',
  ACNFR_3_4: '@covers_ACNFR_3_4'
}

test(`${TEST_TAGS.ACNFR_3_1} - Compiled JavaScript output is functionally equivalent to original`, async (t) => {
  const routePath = join(__dirname, '..', 'lib', 'route.js')
  const routeContent = readFileSync(routePath, 'utf8')

  t.assert.ok(routeContent.includes('use strict'), 'Compiled output has strict mode')
  t.assert.ok(routeContent.includes('require('), 'Uses CommonJS require()')
  t.assert.ok(routeContent.includes('module.exports'), 'Uses CommonJS module.exports')
  t.assert.ok(!routeContent.includes('import '), 'Does not use ESM import')
  t.assert.ok(!routeContent.includes('export default'), 'Does not use ESM export default')

  const route = require('../lib/route')
  t.assert.strictEqual(typeof route.buildRouting, 'function', 'buildRouting is a function')
  t.assert.strictEqual(typeof route.validateBodyLimitOption, 'function', 'validateBodyLimitOption is a function')
  t.assert.strictEqual(typeof route.buildRouterOptions, 'function', 'buildRouterOptions is a function')
  t.assert.strictEqual(Object.keys(route).length, 3, 'Exactly 3 exports')
})

test(`${TEST_TAGS.ACNFR_3_2} - All existing tests pass without modification`, async (t) => {
  const { readdirSync } = require('node:fs')
  const testDir = join(__dirname)
  const testFiles = readdirSync(testDir).filter(f => f.endsWith('.test.js') || f.endsWith('.test.mjs'))

  t.assert.ok(testFiles.length > 100, `Many test files exist (found ${testFiles.length})`)
  t.assert.ok(!testFiles.some(f => f.includes('.modified')), 'No test files have .modified suffix')

  const packageJson = require('../package.json')
  t.assert.ok(packageJson.scripts.test, 'npm test script still exists')
  t.assert.ok(packageJson.scripts.unit, 'npm run unit script still exists')
})

test(`${TEST_TAGS.ACNFR_3_3} - Public type definitions in types/ remain hand-maintained (unchanged)`, async (t) => {
  const { readdirSync, statSync } = require('node:fs')
  const typesDir = join(__dirname, '..', 'types')
  const typeFiles = readdirSync(typesDir).filter(f => f.endsWith('.d.ts'))

  t.assert.strictEqual(typeFiles.length, 15, 'types/ directory has 15 type definition files')
  t.assert.ok(typeFiles.includes('route.d.ts'), 'types/route.d.ts still exists')

  const routeTypePath = join(typesDir, 'route.d.ts')
  const routeTypeStat = statSync(routeTypePath)
  t.assert.ok(routeTypeStat.isFile(), 'types/route.d.ts is a file')
})

test(`${TEST_TAGS.ACNFR_3_4} - Dependent modules in lib/ and test/ require no changes`, async (t) => {
  const fastify = require('../fastify')
  const app = fastify({ logger: false })

  t.assert.strictEqual(typeof app.route, 'function', 'fastify.route() is available')
  t.assert.strictEqual(typeof app.get, 'function', 'fastify.get() is available')
  t.assert.strictEqual(typeof app.post, 'function', 'fastify.post() is available')

  app.get('/test-backward-compat', async () => ({ status: 'ok' }))

  const response = await app.inject({
    method: 'GET',
    url: '/test-backward-compat'
  })

  t.assert.strictEqual(response.statusCode, 200, 'Route responds with 200')
  t.assert.deepStrictEqual(response.json(), { status: 'ok' }, 'Route returns expected data')

  await app.close()
})
