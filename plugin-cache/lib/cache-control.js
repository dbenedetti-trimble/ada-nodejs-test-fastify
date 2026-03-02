'use strict'

function parseCacheControl (header) {
  const result = {
    noStore: false,
    noCache: false,
    private: false,
    maxAge: null,
    sMaxAge: null
  }

  if (!header) return result

  const directives = header.toLowerCase().split(',')
  for (const directive of directives) {
    const trimmed = directive.trim()
    if (trimmed === 'no-store') {
      result.noStore = true
    } else if (trimmed === 'no-cache') {
      result.noCache = true
    } else if (trimmed === 'private') {
      result.private = true
    } else if (trimmed.startsWith('s-maxage=')) {
      const val = parseInt(trimmed.slice(9), 10)
      if (!isNaN(val)) result.sMaxAge = val * 1000
    } else if (trimmed.startsWith('max-age=')) {
      const val = parseInt(trimmed.slice(8), 10)
      if (!isNaN(val)) result.maxAge = val * 1000
    }
  }

  return result
}

module.exports = { parseCacheControl }
