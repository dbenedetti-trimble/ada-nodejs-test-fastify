'use strict'

function parseCacheControl (header) {
  const directives = {}
  if (!header) return directives

  const parts = header.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) {
      directives[trimmed.toLowerCase()] = true
    } else {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (key === 'max-age' || key === 's-maxage') {
        directives[key] = parseInt(val, 10) * 1000
      } else {
        directives[key] = val
      }
    }
  }
  return directives
}

module.exports = { parseCacheControl }
