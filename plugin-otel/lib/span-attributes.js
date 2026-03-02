'use strict'

function buildRequestAttributes (request) {
  const url = request.raw.url || ''
  const qIdx = url.indexOf('?')
  const path = qIdx === -1 ? url : url.slice(0, qIdx)
  const query = qIdx === -1 ? undefined : url.slice(qIdx + 1)

  const attrs = {
    'http.request.method': request.method,
    'url.path': path,
    'url.scheme': request.protocol || 'http',
    'server.address': request.hostname,
    'network.protocol.version': request.raw.httpVersion
  }

  const port = request.raw.socket?.localPort
  if (port != null) {
    attrs['server.port'] = port
  }

  if (query) {
    attrs['url.query'] = query
  }

  const ua = request.headers['user-agent']
  if (ua) {
    attrs['user_agent.original'] = ua
  }

  const contentLength = request.headers['content-length']
  if (contentLength) {
    attrs['http.request.header.content-length'] = Number(contentLength)
  }

  return attrs
}

function buildResponseAttributes (request, reply) {
  const attrs = {
    'http.response.status_code': reply.statusCode,
    'http.route': request.routeOptions?.url || undefined
  }

  const contentLength = reply.getHeader('content-length')
  if (contentLength != null) {
    attrs['http.response.header.content-length'] = Number(contentLength)
  }

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
