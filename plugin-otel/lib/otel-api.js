'use strict'

let api = null

/**
 * Lazily loads @opentelemetry/api on first call and caches the result.
 * Returns false if the module is not installed (no-op mode).
 *
 * @returns {object|false} The OTel API module, or false if unavailable.
 */
function loadOtelApi () {
  if (api !== null) return api
  try {
    api = require('@opentelemetry/api')
  } catch {
    api = false
  }
  return api
}

/**
 * Resets the cached OTel API reference. For testing only.
 * @internal
 */
function _resetOtelApi () {
  api = null
}

module.exports = { loadOtelApi, _resetOtelApi }
