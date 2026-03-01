'use strict'

/**
 * Extracts W3C Trace Context (traceparent/tracestate) from incoming request headers
 * using OTel's propagation API.
 *
 * @param {object} otel - The @opentelemetry/api module
 * @param {Record<string, string|string[]>} headers - Incoming request headers
 * @returns {import('@opentelemetry/api').Context} Extracted OTel context, or ROOT_CONTEXT if absent
 */
function extractContext (otel, headers) {
  const { propagation, ROOT_CONTEXT } = otel
  return propagation.extract(ROOT_CONTEXT, headers, {
    get (carrier, key) { return carrier[key] },
    keys (carrier) { return Object.keys(carrier) }
  })
}

module.exports = { extractContext }
