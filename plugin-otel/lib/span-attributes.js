'use strict'

/**
 * Build OTel HTTP semantic convention attributes from the incoming request.
 * Called during onRequest (span creation).
 * Stable conventions from OTel v1.23.0+.
 * @param {import('fastify').FastifyRequest} request
 * @returns {object}
 */
function buildRequestAttributes (request) {
  // TODO(features): extract and return stable HTTP semantic convention attributes:
  //   http.request.method, url.path, url.query (omit if absent),
  //   url.scheme, server.address, server.port, network.protocol.version,
  //   user_agent.original (omit if absent), http.request.header.content-length
  return {}
}

/**
 * Build OTel HTTP semantic convention attributes from the outgoing response.
 * Called during onResponse (span completion).
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {object}
 */
function buildResponseAttributes (request, reply) {
  // TODO(features): extract and return:
  //   http.response.status_code (number), http.route, http.response.header.content-length
  return {}
}

module.exports = { buildRequestAttributes, buildResponseAttributes }
