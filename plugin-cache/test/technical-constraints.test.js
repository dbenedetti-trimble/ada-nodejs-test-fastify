'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACTC_1_1 @validation_test: LRU cache implemented from scratch using built-in Node.js APIs', async (t) => {
  const LRUCache = require('../lib/lru-cache')
  const lru = new LRUCache(2)

  lru.set('key1', { value: 'val1', expiry: Date.now() + 10000 })
  lru.set('key2', { value: 'val2', expiry: Date.now() + 10000 })

  t.assert.strictEqual(lru.cache.size, 2)
  t.assert.ok(lru.get('key1'))

  lru.set('key3', { value: 'val3', expiry: Date.now() + 10000 })

  t.assert.strictEqual(lru.cache.size, 2)
  t.assert.strictEqual(lru.get('key2'), null, 'Oldest entry (key2) should be evicted')
})

test('@covers_ACTC_1_2 @validation_test: ETag generation uses node:crypto (built-in)', async (t) => {
  const { generateETag } = require('../lib/etag')
  const crypto = require('node:crypto')

  const body = 'test body'
  const etag = generateETag(body)

  t.assert.ok(etag.startsWith('W/"'), 'ETag should be weak ETag format')
  t.assert.strictEqual(etag.length, 20, 'ETag should be W/ + 16 hex chars + quotes')

  const expectedHash = crypto
    .createHash('sha256')
    .update(body)
    .digest('hex')
    .slice(0, 16)

  t.assert.strictEqual(etag, `W/"${expectedHash}"`, 'ETag uses SHA-256 from node:crypto')
})

test('@covers_ACTC_2_1 @covers_ACTC_2_2 @validation_test: Plugin uses fastify-plugin wrapper and decorator is visible to parent', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  await fastify.register(cachePlugin)
  await fastify.ready()

  t.assert.ok(fastify.cache, 'Decorator visible to parent (fastify-plugin effect)')
  t.assert.strictEqual(typeof fastify.cache.stats, 'function')

  await fastify.close()
})

test('@covers_ACTC_3_1 @validation_test: All tests use node:test via borp not other frameworks', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const testDir = path.join(__dirname)
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'))

  for (const file of testFiles) {
    const content = fs.readFileSync(path.join(testDir, file), 'utf8')

    t.assert.ok(
      content.includes("require('node:test')"),
      `${file} should use node:test`
    )

    const hasJestImport = /require\(['"]jest['"]\)/.test(content) || /from ['"]jest['"]/.test(content)
    const hasMochaImport = /require\(['"]mocha['"]\)/.test(content) || /from ['"]mocha['"]/.test(content)

    t.assert.ok(
      !hasJestImport && !hasMochaImport,
      `${file} should not import Jest or Mocha test frameworks`
    )
  }
})

test('@covers_ACTC_4_1 @validation_test: Documentation states plugin should be registered after auth plugins', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const readmePath = path.join(__dirname, '../README.md')
  const readmeContent = fs.readFileSync(readmePath, 'utf8')

  t.assert.ok(
    readmeContent.toLowerCase().includes('register') &&
    readmeContent.toLowerCase().includes('auth'),
    'README should mention plugin registration order relative to auth'
  )

  t.assert.ok(
    readmeContent.includes('AFTER authentication') ||
    readmeContent.includes('after auth'),
    'README should specify registering AFTER auth plugins'
  )
})

test('@covers_ACTC_1_1 @validation_test: LRU cache has no external dependencies', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const lruCachePath = path.join(__dirname, '../lib/lru-cache.js')
  const content = fs.readFileSync(lruCachePath, 'utf8')

  const requirePattern = /require\(['"]([^'"]+)['"]\)/g
  const requires = [...content.matchAll(requirePattern)].map(m => m[1])

  for (const req of requires) {
    t.assert.ok(
      req.startsWith('node:') || req.startsWith('.'),
      `LRU cache should only use built-in modules or relative imports, found: ${req}`
    )
  }

  t.assert.ok(content.includes('new Map()'), 'LRU cache should use built-in Map')
})

test('@covers_ACTC_1_2 @validation_test: ETag module uses only node:crypto', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const etagPath = path.join(__dirname, '../lib/etag.js')
  const content = fs.readFileSync(etagPath, 'utf8')

  t.assert.ok(
    content.includes("require('node:crypto')"),
    'ETag module should require node:crypto'
  )

  const requirePattern = /require\(['"]([^'"]+)['"]\)/g
  const requires = [...content.matchAll(requirePattern)].map(m => m[1])

  for (const req of requires) {
    t.assert.ok(
      req === 'node:crypto' || req.startsWith('.'),
      `ETag module should only use node:crypto or relative imports, found: ${req}`
    )
  }
})

test('@covers_ACTC_1_1 @covers_ACTC_1_2 @validation_test: Plugin package.json has zero runtime dependencies', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const pkgPath = path.join(__dirname, '../package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

  t.assert.deepStrictEqual(
    pkg.dependencies || {},
    {},
    'Plugin should have zero runtime dependencies'
  )

  t.assert.ok(
    pkg.devDependencies['fastify-plugin'],
    'fastify-plugin should be in devDependencies'
  )
})

test('@covers_ACTC_2_1 @validation_test: Plugin exports fastify-plugin wrapped function', async (t) => {
  const pluginExport = require('../index')

  t.assert.strictEqual(typeof pluginExport, 'function', 'Plugin should export a function')
  t.assert.ok(pluginExport[Symbol.for('skip-override')], 'Plugin should be wrapped with fastify-plugin')
  t.assert.strictEqual(pluginExport[Symbol.for('plugin-meta')].name, 'fastify-response-cache')
})

test('@covers_ACTC_3_1 @validation_test: Test files follow borp conventions', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const testDir = path.join(__dirname)
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'))

  t.assert.ok(testFiles.length > 0, 'Test files should exist')

  for (const file of testFiles) {
    t.assert.ok(file.endsWith('.test.js'), `Test file ${file} should have .test.js extension`)
  }
})
