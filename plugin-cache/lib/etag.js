'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  const hash = createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex')
    .slice(0, 16)
  return 'W/"' + hash + '"'
}

module.exports = { generateETag }
