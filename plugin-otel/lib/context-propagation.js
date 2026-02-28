'use strict'

/**
 * Extract W3C Trace Context (traceparent/tracestate) from incoming request headers.
 * Uses OTel's propagation.extract() with a plain-object TextMapGetter.
 * @param {object} otel - the @opentelemetry/api module
 * @param {object} headers - request headers (plain object, lowercased keys)
 * @returns {import('@opentelemetry/api').Context}
 */
function extractContext (otel, headers) {
  // TODO(features): call otel.propagation.extract(otel.ROOT_CONTEXT, headers, getter)
  //   where getter implements TextMapGetter via { get(carrier, key), keys(carrier) }
  return otel.ROOT_CONTEXT
}

module.exports = { extractContext }
