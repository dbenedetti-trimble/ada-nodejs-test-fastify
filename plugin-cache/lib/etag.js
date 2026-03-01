'use strict'

const { createHash } = require('node:crypto')

/**
 * Generate a weak ETag from a response body.
 *
 * Format: W/"<first-16-hex-chars-of-sha256>"
 *
 * @param {string | Buffer} body
 * @returns {string}
 */
function generateETag (body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || '')
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  return 'W/"' + hash + '"'
}

/**
 * Parse an If-None-Match header into an array of ETag strings.
 *
 * @param {string} header
 * @returns {string[]}
 */
function parseIfNoneMatch (header) {
  return header.split(',').map(t => t.trim())
}

/**
 * Check whether an incoming If-None-Match header matches a stored ETag.
 *
 * @param {string} ifNoneMatch - The If-None-Match request header value
 * @param {string} storedETag - The ETag stored in the cache entry
 * @returns {boolean}
 */
function etagMatches (ifNoneMatch, storedETag) {
  const tags = parseIfNoneMatch(ifNoneMatch)
  if (tags.includes('*')) return true
  return tags.includes(storedETag)
}

module.exports = { generateETag, parseIfNoneMatch, etagMatches }
