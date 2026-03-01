'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  const data = typeof body === 'string' ? body : (Buffer.isBuffer(body) ? body : JSON.stringify(body))
  const hash = createHash('sha256')
    .update(data)
    .digest('hex')
    .slice(0, 16)
  return 'W/"' + hash + '"'
}

module.exports = { generateETag }
