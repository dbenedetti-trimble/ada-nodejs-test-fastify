'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  let content
  if (typeof body === 'string') {
    content = body
  } else if (Buffer.isBuffer(body)) {
    content = body
  } else if (body === null || body === undefined) {
    content = ''
  } else {
    content = JSON.stringify(body)
  }
  const hash = createHash('sha256')
    .update(content)
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
