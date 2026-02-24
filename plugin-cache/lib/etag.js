'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  const hash = createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body))
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
