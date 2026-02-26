'use strict'

function buildRequestAttributes (request) {
  const rawUrl = request.url || ''
  const qIdx = rawUrl.indexOf('?')
  const path = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx)

  const attrs = {
    'http.request.method': request.method,
    'url.path': path,
    'url.scheme': request.protocol || 'http',
    'server.address': request.hostname,
    'server.port': request.socket?.localPort ?? 0,
    'network.protocol.version': request.raw.httpVersion
  }

  if (qIdx !== -1) {
    attrs['url.query'] = rawUrl.slice(qIdx + 1)
  }

  const ua = request.headers['user-agent']
  if (ua) attrs['user_agent.original'] = ua

  const cl = request.headers['content-length']
  if (cl !== undefined) attrs['http.request.header.content-length'] = Number(cl)

  return attrs
}

function buildResponseAttributes (request, reply) {
  const route = request.routeOptions?.config?.url ?? request.routeOptions?.url
  const attrs = {
    'http.response.status_code': reply.statusCode,
    'http.route': route ?? ''
  }

  const cl = reply.getHeader('content-length')
  if (cl !== undefined) attrs['http.response.header.content-length'] = Number(cl)

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
