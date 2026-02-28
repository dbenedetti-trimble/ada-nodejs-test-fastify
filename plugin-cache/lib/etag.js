'use strict'

const { createHash } = require('node:crypto')

/**
 * Generate a weak ETag from a response body.
 * Format: W/"<first-16-hex-chars-of-sha256>"
 * @param {string|Buffer} body
 * @returns {string}
 */
function generateETag (body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  return `W/"${hash}"`
}

module.exports = { generateETag }
