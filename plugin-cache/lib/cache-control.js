'use strict'

/**
 * Parse a Cache-Control header value into a directives object.
 * Returns an object where boolean directives map to true and
 * value directives (e.g. max-age=30) map to their string value.
 */
function parseCacheControl (header) {
  const result = {}
  if (!header) return result

  const parts = header.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) {
      result[trimmed.toLowerCase()] = true
    } else {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase()
      const val = trimmed.slice(eqIdx + 1).trim()
      result[key] = val
    }
  }
  return result
}

module.exports = { parseCacheControl }
