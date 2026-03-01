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
  // TODO(features): implement Cache-Control parser
  // - return empty object if header is falsy
  // - split on ',' and trim each token
  // - for each token: split on '=' to get [directive, value]
  // - lowercase directive
  // - for boolean directives (no-store, no-cache, private): set to true
  // - for value directives (max-age, s-maxage): parse value as integer
  return {}
}

module.exports = { parseCacheControl }
