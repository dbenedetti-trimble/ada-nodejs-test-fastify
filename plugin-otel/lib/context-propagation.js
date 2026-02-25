'use strict'

const headerGetter = {
  get (carrier, key) { return carrier[key] },
  keys (carrier) { return Object.keys(carrier) }
}

function extractContext (otel, headers) {
  return otel.propagation.extract(otel.ROOT_CONTEXT, headers, headerGetter)
}

module.exports = { extractContext }
