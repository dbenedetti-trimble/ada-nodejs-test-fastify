'use strict'

function buildRequestAttributes (request, serverPort) {
  const raw = request.raw
  const rawUrl = request.url || '/'
  const qIdx = rawUrl.indexOf('?')
  const pathname = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx)
  const queryString = qIdx === -1 ? '' : rawUrl.slice(qIdx + 1)

  const attrs = {
    'http.request.method': request.method,
    'url.path': pathname,
    'url.scheme': raw.socket && raw.socket.encrypted ? 'https' : 'http',
    'server.address': request.hostname,
    'network.protocol.version': raw.httpVersion
  }

  if (queryString) {
    attrs['url.query'] = queryString
  }

  if (serverPort !== undefined && serverPort !== null) {
    attrs['server.port'] = serverPort
  }

  const ua = request.headers['user-agent']
  if (ua) {
    attrs['user_agent.original'] = ua
  }

  const contentLength = request.headers['content-length']
  if (contentLength !== undefined) {
    attrs['http.request.header.content-length'] = Number(contentLength)
  }

  return attrs
}

function buildResponseAttributes (request, reply) {
  const attrs = {
    'http.response.status_code': reply.statusCode
  }

  const route = request.routeOptions && request.routeOptions.url
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
