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
  // TODO: implement — split on commas, trim each token, extract directives and values
  return {
    noStore: false,
    noCache: false,
    isPrivate: false,
    maxAge: null,
    sMaxAge: null
  }
}

module.exports = { parse }
