'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  const hash = createHash('sha256')
    .update(data)
    .digest('hex')
    .slice(0, 16)
  return 'W/"' + hash + '"'
}

function etagMatches (ifNoneMatch, storedEtag) {
  if (!ifNoneMatch) return false

  const trimmed = ifNoneMatch.trim()
  if (trimmed === '*') return true

  const tags = trimmed.split(',')
  for (const tag of tags) {
    if (tag.trim() === storedEtag) return true
  }
  return false
}

module.exports = { generateETag, etagMatches }
