'use strict'

const { createHash } = require('node:crypto')

/**
 * Generate a weak ETag from a response body.
 * Format: W/"<first-16-hex-chars-of-sha256>"
 * @param {string|Buffer} body
 * @returns {string}
 */
function generateETag (body) {
  // TODO: implement — SHA-256 hash body, take first 16 hex chars, return W/"..." format
  return 'W/"0000000000000000"'
}

module.exports = { generateETag }
