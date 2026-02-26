'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  const hash = createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex')
    .slice(0, 16)
  return 'W/"' + hash + '"'
}

function matchesETag (ifNoneMatch, etag) {
  if (!ifNoneMatch) return false
  const trimmed = ifNoneMatch.trim()
  if (trimmed === '*') return true
  const tags = trimmed.split(',').map(t => t.trim())
  return tags.includes(etag)
}

module.exports = { generateETag, matchesETag }
