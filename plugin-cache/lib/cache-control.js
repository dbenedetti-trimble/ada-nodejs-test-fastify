'use strict'

/**
 * Parse a Cache-Control header string into a directives object.
 *
 * Handles: no-store, no-cache, private, max-age=N, s-maxage=N
 *
 * @param {string} header - The Cache-Control header value (may be null/undefined)
 * @returns {{ 'no-store'?: true, 'no-cache'?: true, private?: true, 'max-age'?: number, 's-maxage'?: number }}
 */
function parseCacheControl (header) {
  if (!header) return {}
  const directives = {}
  for (const token of header.split(',')) {
    const trimmed = token.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) {
      directives[trimmed.toLowerCase()] = true
    } else {
      const directive = trimmed.slice(0, eqIdx).trim().toLowerCase()
      const value = trimmed.slice(eqIdx + 1).trim()
      directives[directive] = parseInt(value, 10)
    }
  }
  return directives
}

module.exports = { parseCacheControl }
