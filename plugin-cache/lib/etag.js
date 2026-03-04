'use strict'

const { createHash } = require('node:crypto')

function generateETag (body) {
  if (body === null || body === undefined) {
    throw new TypeError('body must not be null or undefined')
  }
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16)
  return 'W/"' + hash + '"'
}

module.exports = { generateETag }
