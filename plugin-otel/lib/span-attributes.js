'use strict'

/**
 * Build OTel HTTP semantic convention attributes from the incoming request.
 * Called during onRequest (span creation).
 * Stable conventions from OTel v1.23.0+.
 * @param {import('fastify').FastifyRequest} request
 * @returns {object}
 */
function buildRequestAttributes (request) {
  const rawUrl = request.raw.url || request.url || ''
  const qIdx = rawUrl.indexOf('?')
  const urlPath = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx)
  const urlQuery = qIdx === -1 ? undefined : rawUrl.slice(qIdx + 1)

  const attrs = {
    'http.request.method': request.method,
    'url.path': urlPath,
    'url.scheme': request.protocol || 'http',
    'server.address': request.hostname,
    'network.protocol.version': request.raw.httpVersion
  }

  if (urlQuery) {
    attrs['url.query'] = urlQuery
  }

  const userAgent = request.headers['user-agent']
  if (userAgent) {
    attrs['user_agent.original'] = userAgent
  }

  const contentLength = request.headers['content-length']
  if (contentLength !== undefined) {
    attrs['http.request.header.content-length'] = Number(contentLength)
  }

  const serverPort = request.socket?.localPort ?? (request.raw.socket?.localPort)
  if (serverPort !== undefined) {
    attrs['server.port'] = serverPort
  }

  return attrs
}

/**
 * Build OTel HTTP semantic convention attributes from the outgoing response.
 * Called during onResponse (span completion).
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {object}
 */
function buildResponseAttributes (request, reply) {
  const attrs = {
    'http.response.status_code': reply.statusCode
  }

  const route = request.routeOptions?.url
  if (route) {
    attrs['http.route'] = route
  }

  const contentLength = reply.getHeader('content-length')
  if (contentLength !== undefined) {
    attrs['http.response.header.content-length'] = Number(contentLength)
  }

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
