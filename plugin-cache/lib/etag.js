'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  const content = Buffer.isBuffer(body) ? body : (typeof body === 'string' ? body : JSON.stringify(body))
  const hash = createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 16)
  return 'W/"' + hash + '"'
}

function parseIfNoneMatch (headerValue) {
  if (!headerValue) {
    return []
  }

  if (headerValue.trim() === '*') {
    return ['*']
  }

  return headerValue
    .split(',')
    .map(etag => etag.trim())
    .filter(etag => etag.length > 0)
}

function matchesETag (etag, ifNoneMatchValues) {
  if (!etag || !ifNoneMatchValues || ifNoneMatchValues.length === 0) {
    return false
  }

  if (ifNoneMatchValues.includes('*')) {
    return true
  }

  return ifNoneMatchValues.some(value => value === etag)
}

module.exports = {
  generateETag,
  parseIfNoneMatch,
  matchesETag
}
