'use strict'

/**
 * Builds OTel HTTP semantic convention attributes set at request start (onRequest hook).
 * Follows stable conventions from OTel spec v1.23.0+.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Record<string, string|number>}
 */
function buildRequestAttributes (request) {
  // TODO(features): implement attribute extraction per OTEL-5 spec
  // Required: http.request.method, url.path, url.scheme, server.address,
  //           server.port, network.protocol.version
  // Conditional: url.query (omit if absent), user_agent.original (omit if absent),
  //              http.request.header.content-length (omit if absent, set as number)
  return {}
}

/**
 * Builds OTel HTTP semantic convention attributes set at response completion (onResponse hook).
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Record<string, string|number>}
 */
function buildResponseAttributes (request, reply) {
  // TODO(features): implement attribute extraction per OTEL-5 spec
  // Required: http.response.status_code (number), http.route (parameterized pattern)
  // Conditional: http.response.header.content-length (omit if absent, set as number)
  return {}
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
