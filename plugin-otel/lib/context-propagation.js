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
  // TODO(features): implement W3C propagation extraction per OTEL-7
  // Use otel.propagation.extract with a TextMapGetter that reads from headers object
  return otel.ROOT_CONTEXT
}

module.exports = { extractContext }
