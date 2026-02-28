'use strict'

/**
 * Parsed representation of a Cache-Control header.
 * @typedef {Object} CacheControlDirectives
 * @property {boolean} noStore    - no-store directive present
 * @property {boolean} noCache    - no-cache directive present
 * @property {boolean} isPrivate  - private directive present
 * @property {number|null} maxAge - max-age value in seconds, or null if absent
 * @property {number|null} sMaxAge - s-maxage value in seconds, or null if absent
 */

/**
 * Parse a Cache-Control header string into its directives.
 * Handles: no-store, no-cache, private, max-age=N, s-maxage=N.
 * @param {string|undefined} header
 * @returns {CacheControlDirectives}
 */
function parse (header) {
  const result = { noStore: false, noCache: false, isPrivate: false, maxAge: null, sMaxAge: null }
  if (!header) return result
  for (const token of header.split(',')) {
    const t = token.trim().toLowerCase()
    if (t === 'no-store') {
      result.noStore = true
    } else if (t === 'no-cache') {
      result.noCache = true
    } else if (t === 'private') {
      result.isPrivate = true
    } else if (t.startsWith('max-age=')) {
      const n = parseInt(t.slice(8), 10)
      if (!isNaN(n)) result.maxAge = n
    } else if (t.startsWith('s-maxage=')) {
      const n = parseInt(t.slice(9), 10)
      if (!isNaN(n)) result.sMaxAge = n
    }
  }
  return result
}

module.exports = { parse }
