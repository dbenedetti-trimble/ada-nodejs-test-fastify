'use strict'

function buildRequestAttributes (request) {
  const urlStr = request.url
  const qIdx = urlStr.indexOf('?')
  const path = qIdx >= 0 ? urlStr.slice(0, qIdx) : urlStr
  const query = qIdx >= 0 ? urlStr.slice(qIdx + 1) : undefined

  const attrs = {
    'http.request.method': request.method,
    'url.path': path,
    'url.scheme': request.protocol || 'http',
    'server.address': request.hostname,
    'network.protocol.version': request.raw.httpVersion
  }

  const port = request.socket?.localPort
  if (port) attrs['server.port'] = port

  if (query) {
    attrs['url.query'] = query
  }

  const userAgent = request.headers['user-agent']
  if (userAgent) {
    attrs['user_agent.original'] = userAgent
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
    'http.route': request.routeOptions?.url || request.url
  }

  const contentLength = reply.getHeader('content-length')
  if (contentLength != null) {
    attrs['http.response.header.content-length'] = Number(contentLength)
  }

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
