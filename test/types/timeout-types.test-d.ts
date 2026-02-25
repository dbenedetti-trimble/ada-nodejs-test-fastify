import { expectType, expectAssignable } from 'tsd'
import fastify, { RouteShorthandOptions } from '../../fastify'

// Test routeTimeout option in FastifyServerOptions
const app1 = fastify({ routeTimeout: 30000 })

const app2 = fastify({ routeTimeout: 0 })

const app3 = fastify()

// Test requestTimeout option in RouteShorthandOptions
const routeOptions: RouteShorthandOptions = {
  requestTimeout: 5000
}
expectAssignable<RouteShorthandOptions>(routeOptions)

// Test requestTimeout in route registration
app1.get('/test', { requestTimeout: 2000 }, async (request, reply) => {
  expectType<number | undefined>(request.routeOptions.requestTimeout)
  return { ok: true }
})

// Test signal property on FastifyRequest
app1.get('/signal', async (request, reply) => {
  expectType<AbortSignal>(request.signal)
  expectType<boolean>(request.signal.aborted)
  
  // Signal can be passed to fetch
  const response = await fetch('https://example.com', { signal: request.signal })
  
  return { ok: true }
})

// Test combined usage
const app4 = fastify({ routeTimeout: 30000 })
app4.get('/combined', { requestTimeout: 5000 }, async (request, reply) => {
  expectType<number | undefined>(request.routeOptions.requestTimeout)
  expectType<AbortSignal>(request.signal)
  
  request.signal.addEventListener('abort', () => {
    console.log('Request aborted')
  })
  
  return { status: 'ok' }
})

// Test requestTimeout: 0 to disable
app4.get('/no-timeout', { requestTimeout: 0 }, async (request, reply) => {
  expectType<number | undefined>(request.routeOptions.requestTimeout)
  expectType<AbortSignal>(request.signal)
  return { status: 'ok' }
})
