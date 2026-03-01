'use strict'

/**
 * Builds OTel HTTP semantic convention attributes set at request start (onRequest hook).
 * Follows stable conventions from OTel spec v1.23.0+.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Record<string, string|number>}
 */
function buildRequestAttributes (request) {
  const urlStr = request.url || ''
  const qIdx = urlStr.indexOf('?')
  const path = qIdx === -1 ? urlStr : urlStr.slice(0, qIdx)
  const query = qIdx === -1 ? undefined : urlStr.slice(qIdx + 1)

  const attrs = {
    'http.request.method': request.method,
    'url.path': path,
    'url.scheme': request.protocol ?? 'http',
    'server.address': request.hostname,
    'network.protocol.version': request.raw.httpVersion
  }

  if (query) attrs['url.query'] = query

  const port = request.server?.address?.()?.port
  if (port != null) attrs['server.port'] = port

  const ua = request.headers['user-agent']
  if (ua) attrs['user_agent.original'] = ua

  const cl = request.headers['content-length']
  if (cl != null) attrs['http.request.header.content-length'] = Number(cl)

  return attrs
}

/**
 * Builds OTel HTTP semantic convention attributes set at response completion (onResponse hook).
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Record<string, string|number>}
 */
function buildResponseAttributes (request, reply) {
  const attrs = {
    'http.response.status_code': reply.statusCode
  }

  if (request.routeOptions?.url) attrs['http.route'] = request.routeOptions.url

  const cl = reply.getHeader('content-length')
  if (cl != null) attrs['http.response.header.content-length'] = Number(cl)

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
