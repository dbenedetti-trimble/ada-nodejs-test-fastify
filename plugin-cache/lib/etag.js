'use strict'

const { createHash } = require('node:crypto')

/**
 * Generate a weak ETag from a response body.
 * Format: W/"<first-16-hex-chars-of-sha256>"
 *
 * @param {string | Buffer} body
 * @returns {string}
 */
function generateETag (body) {
  // TODO: implement in features pass
  // 1. Normalize body to Buffer
  // 2. SHA-256 hash, hex digest, slice first 16 chars
  // 3. Return 'W/"' + hash + '"'
  return 'W/"0000000000000000"'
}

/**
 * Check whether an If-None-Match header value matches a stored ETag.
 * Handles:
 *   - '*' wildcard (matches any stored ETag)
 *   - comma-separated list of ETags
 *
 * @param {string} ifNoneMatch  — value of the If-None-Match header
 * @param {string} storedETag   — ETag stored in the cache entry
 * @returns {boolean}
 */
function matchesETag (ifNoneMatch, storedETag) {
  // TODO: implement in features pass
  // 1. If ifNoneMatch === '*', return true
  // 2. Split on ',', trim each value
  // 3. Return true if any token === storedETag
  return false
}

module.exports = { generateETag, matchesETag }
