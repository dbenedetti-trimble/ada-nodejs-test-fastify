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

function setOtelApi (mockApi) {
  api = mockApi
}

module.exports = { loadOtelApi, setOtelApi }
