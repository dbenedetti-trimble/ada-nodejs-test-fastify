'use strict'

/**
 * Extract W3C Trace Context (traceparent/tracestate) from incoming request headers.
 * Uses OTel's propagation.extract() with a plain-object TextMapGetter.
 * @param {object} otel - the @opentelemetry/api module
 * @param {object} headers - request headers (plain object, lowercased keys)
 * @returns {import('@opentelemetry/api').Context}
 */
function extractContext (otel, headers) {
  return otel.propagation.extract(otel.ROOT_CONTEXT, headers, {
    get (carrier, key) { return carrier[key] },
    keys (carrier) { return Object.keys(carrier) }
  })
}

module.exports = { extractContext }
