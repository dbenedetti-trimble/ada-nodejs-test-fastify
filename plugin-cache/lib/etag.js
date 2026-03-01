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
  // TODO(features): implement ETag generation
  // - coerce body to Buffer
  // - sha256 hash, hex digest, slice(0, 16)
  // - return 'W/"' + hash + '"'
  return 'W/"0000000000000000"'
}

/**
 * Parse an If-None-Match header into an array of ETag strings.
 *
 * @param {string} header
 * @returns {string[]}
 */
function parseIfNoneMatch (header) {
  // TODO(features): implement If-None-Match parsing
  // - split on ',' and trim each token
  // - return array of ETag strings (may include '*')
  return []
}

/**
 * Check whether an incoming If-None-Match header matches a stored ETag.
 *
 * @param {string} ifNoneMatch - The If-None-Match request header value
 * @param {string} storedETag - The ETag stored in the cache entry
 * @returns {boolean}
 */
function etagMatches (ifNoneMatch, storedETag) {
  // TODO(features): implement ETag matching
  // - parse ifNoneMatch into array
  // - if any value is '*', return true
  // - return true if storedETag appears in the array
  return false
}

module.exports = { generateETag, parseIfNoneMatch, etagMatches }
