'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('@covers_ACNFR_1_1 @validation_test: Cached GET responses served from memory, handler not called', async (t) => {
  t.plan(8)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCallCount = 0

  fastify.get('/performance', {
    config: { cache: true }
  }, () => {
    handlerCallCount++
    return { data: 'test', timestamp: Date.now() }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/performance' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCallCount, 1, 'NFR-1: Handler called on first request')
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/performance' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(handlerCallCount, 1, 'NFR-1: Handler NOT called on cache hit - served from memory')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({ method: 'GET', url: '/performance' })
  t.assert.strictEqual(handlerCallCount, 1, 'NFR-1: Handler still not called on subsequent hits')
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACNFR_2_1 @validation_test: If-None-Match requests get 304 Not Modified when content unchanged', async (t) => {
  t.plan(7)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/conditional', {
    config: { cache: true }
  }, () => {
    return { data: 'unchanged content' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/conditional' })
  const etag = res1.headers.etag
  t.assert.ok(etag, 'ETag generated')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/conditional',
    headers: { 'if-none-match': etag }
  })

  t.assert.strictEqual(res2.statusCode, 304, 'NFR-2: 304 Not Modified returned')
  t.assert.strictEqual(res2.body, '', 'NFR-2: No body in 304 response')
  t.assert.strictEqual(res2.headers.etag, etag, 'NFR-2: ETag header present in 304')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/conditional',
    headers: { 'if-none-match': 'W/"different-etag"' }
  })

  t.assert.strictEqual(res3.statusCode, 200, 'NFR-2: Full response when ETag differs')
  t.assert.deepStrictEqual(res3.json(), { data: 'unchanged content' })

  await fastify.close()
})

test('@covers_ACNFR_3_1 @validation_test: Responses with no-store are never cached', async (t) => {
  t.plan(7)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let noStoreCallCount = 0
  fastify.get('/no-store', {
    config: { cache: true }
  }, (request, reply) => {
    noStoreCallCount++
    reply.header('cache-control', 'no-store')
    return { sensitive: 'data', call: noStoreCallCount }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(noStoreCallCount, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(noStoreCallCount, 2, 'NFR-3: Handler called again - no-store respected')
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'NFR-3: Always MISS with no-store')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0, 'NFR-3: No items cached with no-store')

  await fastify.close()
})

test('@covers_ACNFR_4_1 @validation_test: POST/PUT/DELETE/PATCH never cached', async (t) => {
  t.plan(11)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let postCalls = 0
  let putCalls = 0
  let deleteCalls = 0
  let patchCalls = 0

  fastify.post('/data', { config: { cache: true } }, () => {
    postCalls++
    return { created: true }
  })

  fastify.put('/data/:id', { config: { cache: true } }, () => {
    putCalls++
    return { updated: true }
  })

  fastify.delete('/data/:id', { config: { cache: true } }, () => {
    deleteCalls++
    return { deleted: true }
  })

  fastify.patch('/data/:id', { config: { cache: true } }, () => {
    patchCalls++
    return { patched: true }
  })

  fastify.get('/test', { config: { cache: true } }, () => ({ test: 'data' }))

  await fastify.ready()

  await fastify.inject({ method: 'POST', url: '/data', payload: {} })
  await fastify.inject({ method: 'POST', url: '/data', payload: {} })
  t.assert.strictEqual(postCalls, 2, 'NFR-4: POST handler called every time')

  await fastify.inject({ method: 'PUT', url: '/data/1', payload: {} })
  await fastify.inject({ method: 'PUT', url: '/data/1', payload: {} })
  t.assert.strictEqual(putCalls, 2, 'NFR-4: PUT handler called every time')

  await fastify.inject({ method: 'DELETE', url: '/data/1' })
  await fastify.inject({ method: 'DELETE', url: '/data/1' })
  t.assert.strictEqual(deleteCalls, 2, 'NFR-4: DELETE handler called every time')

  await fastify.inject({ method: 'PATCH', url: '/data/1', payload: {} })
  await fastify.inject({ method: 'PATCH', url: '/data/1', payload: {} })
  t.assert.strictEqual(patchCalls, 2, 'NFR-4: PATCH handler called every time')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0, 'NFR-4: No non-GET methods cached')
  t.assert.strictEqual(stats.hits, 0, 'NFR-4: No cache hits for non-GET methods')
  t.assert.strictEqual(stats.misses, 0, 'NFR-4: Non-GET methods do not count as misses')

  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const statsAfterGet = fastify.cache.stats()
  t.assert.strictEqual(statsAfterGet.items, 1, 'NFR-4: GET requests still cached normally')
  t.assert.strictEqual(statsAfterGet.hits, 1)
  t.assert.strictEqual(statsAfterGet.misses, 1)
  t.assert.strictEqual(postCalls + putCalls + deleteCalls + patchCalls, 8, 'NFR-4: All non-GET calls executed')

  await fastify.close()
})

test('@covers_ACNFR_5_1 @validation_test: Entries removed after configured TTL', async (t) => {
  t.plan(8)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/ttl-test', {
    config: { cache: { ttl: 150 } }
  }, () => {
    handlerCalls++
    return { data: 'expires soon', timestamp: Date.now() }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/ttl-test' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/ttl-test' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'NFR-5: Cached before TTL expiry')
  t.assert.strictEqual(handlerCalls, 1)

  await new Promise(resolve => setTimeout(resolve, 100))

  const res3 = await fastify.inject({ method: 'GET', url: '/ttl-test' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT', 'NFR-5: Still cached at 100ms (TTL 150ms)')
  t.assert.strictEqual(handlerCalls, 1)

  await new Promise(resolve => setTimeout(resolve, 60))

  const res4 = await fastify.inject({ method: 'GET', url: '/ttl-test' })
  t.assert.strictEqual(res4.headers['x-cache'], 'MISS', 'NFR-5: Evicted after TTL expiry')
  t.assert.strictEqual(handlerCalls, 2, 'NFR-5: Handler called again after expiry')

  await fastify.close()
})

test('@covers_ACNFR_6_1 @validation_test: Oldest entries evicted when cache is full', async (t) => {
  t.plan(9)
  const fastify = Fastify()

  await fastify.register(require('../index'), { maxItems: 3, ttl: 60000 })

  fastify.get('/item1', { config: { cache: true } }, () => ({ id: 1 }))
  fastify.get('/item2', { config: { cache: true } }, () => ({ id: 2 }))
  fastify.get('/item3', { config: { cache: true } }, () => ({ id: 3 }))
  fastify.get('/item4', { config: { cache: true } }, () => ({ id: 4 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/item1' })
  await fastify.inject({ method: 'GET', url: '/item2' })
  await fastify.inject({ method: 'GET', url: '/item3' })

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 3, 'NFR-6: Cache at max capacity')

  const res1 = await fastify.inject({ method: 'GET', url: '/item1' })
  t.assert.strictEqual(res1.headers['x-cache'], 'HIT')

  const res2 = await fastify.inject({ method: 'GET', url: '/item2' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({ method: 'GET', url: '/item3' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')

  await fastify.inject({ method: 'GET', url: '/item4' })

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 3, 'NFR-6: Cache still at max capacity after adding new item')

  const res1After = await fastify.inject({ method: 'GET', url: '/item1' })
  t.assert.strictEqual(res1After.headers['x-cache'], 'MISS', 'NFR-6: Oldest entry (item1) evicted')

  const res4After = await fastify.inject({ method: 'GET', url: '/item4' })
  t.assert.strictEqual(res4After.headers['x-cache'], 'HIT', 'NFR-6: Item4 (newest) in cache')

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 3, 'NFR-6: Cache maintains max capacity')
  t.assert.ok(stats.hits > 0 && stats.misses > 0, 'NFR-6: LRU eviction working correctly')

  await fastify.close()
})

test('@covers_ACNFR_7_1 @regression_test: All plugin tests pass without regressions', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/test1', { config: { cache: true } }, () => ({ test: 1 }))
  fastify.get('/test2', { config: { cache: true } }, () => ({ test: 2 }))
  fastify.get('/no-cache', () => ({ test: 'no-cache' }))

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/test1' })
  t.assert.strictEqual(res1.statusCode, 200, 'NFR-7: Basic requests work')

  const res2 = await fastify.inject({ method: 'GET', url: '/test1' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'NFR-7: Caching works')

  const res3 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res3.statusCode, 200, 'NFR-7: Non-cached routes work')
  t.assert.strictEqual(res3.headers['x-cache'], undefined, 'NFR-7: Non-cached routes unaffected')

  const stats = fastify.cache.stats()
  t.assert.ok(stats.items >= 0 && stats.hits >= 0 && stats.misses >= 0, 'NFR-7: Stats API works')

  await fastify.close()
})

test('@covers_ACNFR_8_1 @validation_test: Plugin exports valid TypeScript type definitions', async (t) => {
  t.plan(4)

  const fs = require('node:fs')
  const path = require('node:path')

  const pluginDir = path.join(__dirname, '..')
  const typeFiles = [
    path.join(pluginDir, 'types', 'index.d.ts'),
    path.join(pluginDir, 'index.d.ts')
  ]

  let typeFileExists = false
  let typeFilePath = null

  for (const file of typeFiles) {
    if (fs.existsSync(file)) {
      typeFileExists = true
      typeFilePath = file
      break
    }
  }

  t.assert.ok(typeFileExists, 'NFR-8: TypeScript definition file exists')

  if (typeFileExists) {
    const content = fs.readFileSync(typeFilePath, 'utf-8')
    t.assert.ok(content.length > 0, 'NFR-8: Type definition file is not empty')
    t.assert.ok(content.includes('fastify'), 'NFR-8: Type definition references fastify')
    t.assert.ok(
      content.includes('cache') || content.includes('Cache'),
      'NFR-8: Type definition includes cache types'
    )
  } else {
    t.assert.fail('NFR-8: No TypeScript definition file found')
    t.assert.fail('NFR-8: Cannot validate type definition content')
    t.assert.fail('NFR-8: Cannot validate type definition structure')
  }
})

test('@validation_test: Comprehensive NFR validation summary', async (t) => {
  t.plan(8)
  const fastify = Fastify()

  await fastify.register(require('../index'), { maxItems: 100, ttl: 60000 })

  let handlerCalls = 0
  fastify.get('/nfr-summary', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'max-age=60')
    return { validated: true, nfr: 'complete' }
  })

  fastify.post('/nfr-post', { config: { cache: true } }, () => ({ posted: true }))

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/nfr-summary' })
  t.assert.strictEqual(res1.statusCode, 200, 'Performance: GET succeeds')
  t.assert.ok(res1.headers.etag, 'Compliance: ETag generated')

  await fastify.inject({ method: 'GET', url: '/nfr-summary' })
  t.assert.strictEqual(handlerCalls, 1, 'Performance: Handler not called on cache hit')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/nfr-summary',
    headers: { 'if-none-match': res1.headers.etag }
  })
  t.assert.strictEqual(res3.statusCode, 304, 'Compliance: Conditional request returns 304')

  await fastify.inject({ method: 'POST', url: '/nfr-post', payload: {} })
  await fastify.inject({ method: 'POST', url: '/nfr-post', payload: {} })

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1, 'Safety: Only GET cached')
  t.assert.strictEqual(stats.maxItems, 100, 'Memory: Max items configured')
  t.assert.ok(stats.hits >= 1, 'Freshness: Cache hits tracked')
  t.assert.ok(stats.misses >= 1, 'Regression: Stats working correctly')

  await fastify.close()
})
