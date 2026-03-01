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
  const buf = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  return 'W/"' + hash + '"'
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
  if (ifNoneMatch === '*') return true
  return ifNoneMatch.split(',').some(token => token.trim() === storedETag)
}

module.exports = { generateETag, matchesETag }
