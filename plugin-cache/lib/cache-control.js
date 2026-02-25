'use strict'

function parseCacheControl (headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return {}
  }

  const directives = {}
  const parts = headerValue.split(',').map(d => d.trim())

  for (const part of parts) {
    const eqIndex = part.indexOf('=')
    if (eqIndex === -1) {
      directives[part.toLowerCase()] = true
    } else {
      const key = part.slice(0, eqIndex).trim().toLowerCase()
      const value = part.slice(eqIndex + 1).trim()
      const numValue = parseInt(value, 10)
      directives[key] = isNaN(numValue) ? value : numValue
    }
  }

  return directives
}

function parseRequestCacheControl (request) {
  const cacheControl = request.headers['cache-control']
  const directives = parseCacheControl(cacheControl)

  return {
    noCache: directives['no-cache'] === true,
    noStore: directives['no-store'] === true
  }
}

function parseResponseCacheControl (reply) {
  const cacheControl = reply.getHeader('cache-control')
  const directives = parseCacheControl(cacheControl)

  const result = {
    noStore: directives['no-store'] === true,
    noCache: directives['no-cache'] === true,
    private: directives.private === true,
    ttlOverride: null
  }

  if (typeof directives['s-maxage'] === 'number') {
    result.ttlOverride = directives['s-maxage'] * 1000
  } else if (typeof directives['max-age'] === 'number') {
    result.ttlOverride = directives['max-age'] * 1000
  }

  return result
}

module.exports = {
  parseCacheControl,
  parseRequestCacheControl,
  parseResponseCacheControl
}
