'use strict'

function buildRequestAttributes (request) {
  const attrs = {}

  attrs['http.request.method'] = request.method

  const url = new URL(request.url, 'http://placeholder')
  attrs['url.path'] = url.pathname

  if (url.search && url.search !== '?') {
    attrs['url.query'] = url.search.substring(1)
  }

  attrs['url.scheme'] = request.protocol || 'http'
  attrs['server.address'] = request.hostname
  attrs['server.port'] = request.socket?.localPort || 80
  attrs['network.protocol.version'] = request.raw.httpVersion

  const userAgent = request.headers['user-agent']
  if (userAgent) {
    attrs['user_agent.original'] = userAgent
  }

  const reqContentLength = request.headers['content-length']
  if (reqContentLength !== undefined) {
    const parsed = parseInt(reqContentLength, 10)
    if (!isNaN(parsed)) {
      attrs['http.request.header.content-length'] = parsed
    }
  }

  return attrs
}

function buildResponseAttributes (request, reply) {
  const attrs = {}

  attrs['http.response.status_code'] = reply.statusCode

  const route = request.routeOptions?.url
  if (route) {
    attrs['http.route'] = route
  }

  const resContentLength = reply.getHeader('content-length')
  if (resContentLength !== undefined) {
    const parsed = parseInt(String(resContentLength), 10)
    if (!isNaN(parsed)) {
      attrs['http.response.header.content-length'] = parsed
    }
  }

  return attrs
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
