'use strict'

function parseCacheControl (headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return {}
  }

  const directives = {}
  const parts = headerValue.split(',').map(p => p.trim())

  for (const part of parts) {
    const equalsIndex = part.indexOf('=')
    if (equalsIndex === -1) {
      directives[part.toLowerCase()] = true
    } else {
      const key = part.slice(0, equalsIndex).trim().toLowerCase()
      const value = part.slice(equalsIndex + 1).trim()
      const numValue = parseInt(value, 10)
      directives[key] = isNaN(numValue) ? value : numValue
    }
  }

  return directives
}

function shouldCache (responseCacheControl) {
  if (!responseCacheControl) {
    return true
  }

  const directives = typeof responseCacheControl === 'string'
    ? parseCacheControl(responseCacheControl)
    : responseCacheControl

  if (directives['no-store'] || directives.private) {
    return false
  }

  return true
}

function getTTL (responseCacheControl, defaultTtl) {
  if (!responseCacheControl) {
    return defaultTtl
  }

  const directives = typeof responseCacheControl === 'string'
    ? parseCacheControl(responseCacheControl)
    : responseCacheControl

  if (directives['no-cache']) {
    return -1
  }

  if (directives['s-maxage'] !== undefined) {
    return directives['s-maxage'] * 1000
  }

  if (directives['max-age'] !== undefined) {
    return directives['max-age'] * 1000
  }

  return defaultTtl
}

function shouldBypassCache (requestCacheControl) {
  if (!requestCacheControl) {
    return false
  }

  const directives = typeof requestCacheControl === 'string'
    ? parseCacheControl(requestCacheControl)
    : requestCacheControl

  return directives['no-cache'] || directives['no-store']
}

function shouldStoreAfterBypass (requestCacheControl) {
  if (!requestCacheControl) {
    return true
  }

  const directives = typeof requestCacheControl === 'string'
    ? parseCacheControl(requestCacheControl)
    : requestCacheControl

  return !directives['no-store']
}

module.exports = {
  parseCacheControl,
  shouldCache,
  getTTL,
  shouldBypassCache,
  shouldStoreAfterBypass
}
