'use strict'

const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

test('Compiled lib/route.js is valid CommonJS', async (t) => {
  await t.test('@covers_ACNFR_2_1: Compiled lib/route.js uses require() for imports (not ESM import)', async (t) => {
    const routePath = path.join(__dirname, '..', 'lib', 'route.js')
    const routeContent = fs.readFileSync(routePath, 'utf8')

    t.assert.ok(
      routeContent.includes('require('),
      'Compiled file should use require() for imports'
    )

    t.assert.ok(
      !routeContent.match(/^import\s+/m) && !routeContent.match(/^export\s+/m),
      'Compiled file should not use ESM import/export syntax'
    )

    const requirePattern = /require\(["'].*?["']\)/g
    const requireMatches = routeContent.match(requirePattern)
    t.assert.ok(
      requireMatches && requireMatches.length > 0,
      'Compiled file should contain multiple require() calls for dependencies'
    )
  })

  await t.test('@covers_ACNFR_2_2: It uses module.exports or exports for the public API', async (t) => {
    const routePath = path.join(__dirname, '..', 'lib', 'route.js')
    const routeContent = fs.readFileSync(routePath, 'utf8')

    t.assert.ok(
      routeContent.includes('module.exports'),
      'Compiled file should use module.exports for exporting'
    )

    const moduleExportsPattern = /module\.exports\s*=\s*\{[^}]*buildRouting[^}]*\}/
    t.assert.ok(
      moduleExportsPattern.test(routeContent),
      'module.exports should export buildRouting function'
    )

    t.assert.ok(
      /module\.exports\s*=\s*\{[^}]*validateBodyLimitOption[^}]*\}/.test(routeContent),
      'module.exports should export validateBodyLimitOption function'
    )

    t.assert.ok(
      /module\.exports\s*=\s*\{[^}]*buildRouterOptions[^}]*\}/.test(routeContent),
      'module.exports should export buildRouterOptions function'
    )
  })

  await t.test('@covers_ACNFR_2_3: Other lib/ modules can require(\'./route\') without changes', async (t) => {
    let route
    t.assert.doesNotThrow(() => {
      route = require('../lib/route')
    }, 'Other modules should be able to require lib/route without errors')

    t.assert.ok(route, 'Required module should not be null or undefined')
    t.assert.strictEqual(typeof route, 'object', 'Required module should be an object')

    t.assert.strictEqual(
      typeof route.buildRouting,
      'function',
      'buildRouting should be exported as a function'
    )

    t.assert.strictEqual(
      typeof route.validateBodyLimitOption,
      'function',
      'validateBodyLimitOption should be exported as a function'
    )

    t.assert.strictEqual(
      typeof route.buildRouterOptions,
      'function',
      'buildRouterOptions should be exported as a function'
    )

    const exportedKeys = Object.keys(route)
    t.assert.strictEqual(
      exportedKeys.length,
      3,
      'Route module should export exactly 3 functions'
    )

    t.assert.ok(
      exportedKeys.includes('buildRouting'),
      'Exported keys should include buildRouting'
    )
    t.assert.ok(
      exportedKeys.includes('validateBodyLimitOption'),
      'Exported keys should include validateBodyLimitOption'
    )
    t.assert.ok(
      exportedKeys.includes('buildRouterOptions'),
      'Exported keys should include buildRouterOptions'
    )
  })

  await t.test('Compiled output has proper CommonJS structure', async (t) => {
    const routePath = path.join(__dirname, '..', 'lib', 'route.js')
    const routeContent = fs.readFileSync(routePath, 'utf8')

    t.assert.ok(
      routeContent.startsWith('/**') || routeContent.startsWith("'use strict'") || routeContent.includes("'use strict'"),
      'Compiled file should use strict mode'
    )

    t.assert.ok(
      !routeContent.includes('export default'),
      'Compiled file should not use ESM export default'
    )

    t.assert.ok(
      !routeContent.includes('export {'),
      'Compiled file should not use ESM named exports'
    )

    t.assert.ok(
      !routeContent.match(/\bimport\s+.*\s+from\s+/),
      'Compiled file should not use ESM import ... from syntax'
    )
  })

  await t.test('Compiled output is functionally valid', async (t) => {
    const route = require('../lib/route')

    const mockOptions = {
      routerOptions: {
        ignoreTrailingSlash: true,
        caseSensitive: false
      }
    }

    const defaultOptions = {
      ignoreTrailingSlash: false,
      caseSensitive: true
    }

    t.assert.doesNotThrow(() => {
      route.validateBodyLimitOption(1024)
    }, 'validateBodyLimitOption should accept valid body limit')

    t.assert.throws(
      () => route.validateBodyLimitOption(-1),
      'validateBodyLimitOption should throw for invalid body limit'
    )

    t.assert.doesNotThrow(() => {
      const routerOptions = route.buildRouterOptions(mockOptions, defaultOptions)
      t.assert.ok(routerOptions, 'buildRouterOptions should return router options')
      t.assert.strictEqual(routerOptions.ignoreTrailingSlash, true, 'Should use provided router options')
    }, 'buildRouterOptions should work with valid options')

    t.assert.doesNotThrow(() => {
      const routingApi = route.buildRouting({})
      t.assert.ok(routingApi, 'buildRouting should return routing API')
      t.assert.strictEqual(typeof routingApi.setup, 'function', 'Routing API should have setup method')
      t.assert.strictEqual(typeof routingApi.route, 'function', 'Routing API should have route method')
      t.assert.strictEqual(typeof routingApi.routing, 'function', 'Routing API should have routing method')
    }, 'buildRouting should return valid routing API object')
  })
})
