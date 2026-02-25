'use strict'

function extractContext (otel, headers) {
  const { propagation, ROOT_CONTEXT } = otel
  return propagation.extract(ROOT_CONTEXT, headers, {
    get (carrier, key) { return carrier[key] },
    keys (carrier) { return Object.keys(carrier) }
  })
}

module.exports = { extractContext }
