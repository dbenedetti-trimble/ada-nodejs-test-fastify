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
      const name = trimmed.slice(0, eqIdx).trim().toLowerCase()
      const value = trimmed.slice(eqIdx + 1).trim()
      directives[name] = value
    }
  }
  return directives
}

function computeTtl (directives, defaultTtl) {
  if (directives['no-store'] || directives.private) {
    return -1
  }

  if (directives['s-maxage'] !== undefined && directives['s-maxage'] !== true) {
    const seconds = parseInt(directives['s-maxage'], 10)
    if (!isNaN(seconds)) return seconds * 1000
  }

  if (directives['max-age'] !== undefined && directives['max-age'] !== true) {
    const seconds = parseInt(directives['max-age'], 10)
    if (!isNaN(seconds)) return seconds * 1000
  }

  if (directives['no-cache']) {
    return 0
  }

  return defaultTtl
}

module.exports = { parseCacheControl, computeTtl }
