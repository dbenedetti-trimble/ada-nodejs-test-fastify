'use strict'

function buildRequestAttributes (request) {
  const raw = request.raw
  const url = request.url || ''
  const qIdx = url.indexOf('?')
  const path = qIdx >= 0 ? url.slice(0, qIdx) : url
  const query = qIdx >= 0 ? url.slice(qIdx + 1) : undefined

  const attrs = {
    'http.request.method': request.method,
    'url.path': path,
    'url.scheme': raw.socket && raw.socket.encrypted ? 'https' : 'http',
    'server.address': request.hostname,
    'network.protocol.version': raw.httpVersion
  }

  if (query !== undefined && query !== '') {
    attrs['url.query'] = query
  }

  const ua = request.headers['user-agent']
  if (ua) {
    attrs['user_agent.original'] = ua
  }

  const cl = request.headers['content-length']
  if (cl !== undefined) {
    const num = parseInt(cl, 10)
    attrs['http.request.header.content-length'] = isNaN(num) ? cl : num
  }

  return attrs
}

function buildResponseAttributes (request, reply) {
  const attrs = {
    'http.response.status_code': reply.statusCode,
    'http.route': request.routeOptions?.url || ''
  }

  const cl = reply.getHeader('content-length')
  if (cl !== undefined) {
    const num = typeof cl === 'string' ? parseInt(cl, 10) : cl
    attrs['http.response.header.content-length'] = isNaN(num) ? cl : num
  }

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
