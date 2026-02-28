'use strict'

let api = null

/**
 * Lazily load @opentelemetry/api. Caches the result at module scope.
 * Returns the api module object on success, false if the module is not installed.
 * @returns {object|false}
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

module.exports = { loadOtelApi }
