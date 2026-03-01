'use strict'

/**
 * Parse a Cache-Control header value into a directive object.
 *
 * Handles both request and response Cache-Control headers.
 *
 * @param {string | undefined} headerValue
 * @returns {{ noStore: boolean, noCache: boolean, private: boolean, maxAge: number | null, sMaxAge: number | null }}
 */
function parseCacheControl (headerValue) {
  const result = {
    noStore: false,
    noCache: false,
    private: false,
    maxAge: null,
    sMaxAge: null
  }
  if (!headerValue) return result

  for (const token of headerValue.split(',')) {
    const directive = token.trim().toLowerCase()
    if (directive === 'no-store') {
      result.noStore = true
    } else if (directive === 'no-cache') {
      result.noCache = true
    } else if (directive === 'private') {
      result.private = true
    } else if (directive.startsWith('max-age=')) {
      const n = parseInt(directive.slice(8), 10)
      if (!isNaN(n)) result.maxAge = n
    } else if (directive.startsWith('s-maxage=')) {
      const n = parseInt(directive.slice(9), 10)
      if (!isNaN(n)) result.sMaxAge = n
    }
  }

  return result
}

module.exports = parseCacheControl
