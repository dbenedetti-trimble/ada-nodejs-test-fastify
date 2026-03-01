'use strict'

/**
 * Parses a Cache-Control header value into a directives object.
 * Returns an object with boolean flags and numeric values for recognized directives.
 */
function parseCacheControl (header) {
  const result = {
    noStore: false,
    noCache: false,
    private: false,
    maxAge: null,
    sMaxage: null
  }

  if (!header) return result

  const parts = header.split(',')
  for (const part of parts) {
    const directive = part.trim().toLowerCase()
    if (directive === 'no-store') {
      result.noStore = true
    } else if (directive === 'no-cache') {
      result.noCache = true
    } else if (directive === 'private') {
      result.private = true
    } else if (directive.startsWith('max-age=')) {
      const val = parseInt(directive.slice(8), 10)
      if (!isNaN(val)) result.maxAge = val
    } else if (directive.startsWith('s-maxage=')) {
      const val = parseInt(directive.slice(9), 10)
      if (!isNaN(val)) result.sMaxage = val
    }
  }

  return result
}

module.exports = { parseCacheControl }
