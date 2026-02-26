'use strict'

function parseResponseCC (header) {
  if (!header) return {}
  const result = {}
  for (const part of header.split(',')) {
    const token = part.trim().toLowerCase()
    if (token === 'no-store') {
      result.noStore = true
    } else if (token === 'no-cache') {
      result.noCache = true
    } else if (token === 'private') {
      result.private = true
    } else if (token.startsWith('s-maxage=')) {
      const n = parseInt(token.slice(9), 10)
      if (!isNaN(n)) result.sMaxAge = n
    } else if (token.startsWith('max-age=')) {
      const n = parseInt(token.slice(8), 10)
      if (!isNaN(n)) result.maxAge = n
    }
  }
  return result
}

function parseRequestCC (header) {
  if (!header) return {}
  const result = {}
  for (const part of header.split(',')) {
    const token = part.trim().toLowerCase()
    if (token === 'no-cache') {
      result.noCache = true
    } else if (token === 'no-store') {
      result.noStore = true
    }
  }
  return result
}

module.exports = { parseResponseCC, parseRequestCC }
