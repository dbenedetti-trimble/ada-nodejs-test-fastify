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
  // TODO: implement in features pass
  // 1. Return all-false/null defaults if headerValue is falsy
  // 2. Split on ',', trim, lowercase each token
  // 3. For each token:
  //    - 'no-store'  → noStore = true
  //    - 'no-cache'  → noCache = true
  //    - 'private'   → private = true
  //    - 'max-age=N' → maxAge = parseInt(N) (seconds)
  //    - 's-maxage=N'→ sMaxAge = parseInt(N) (seconds)
  return {
    noStore: false,
    noCache: false,
    private: false,
    maxAge: null,
    sMaxAge: null
  }
}

module.exports = parseCacheControl
