'use strict'

let api = null

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
