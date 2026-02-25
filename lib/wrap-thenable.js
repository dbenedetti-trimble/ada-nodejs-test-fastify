'use strict'

const {
  kReplyIsError,
  kReplyHijacked
} = require('./symbols')
const { setErrorStatusCode } = require('./error-status')
const { FSTWRN005 } = require('./warnings')

const diagnostics = require('node:diagnostics_channel')
const channels = diagnostics.tracingChannel('fastify.request.handler')

const warnedRoutes = new Set()

function wrapThenable (thenable, reply, store) {
  if (store) store.async = true
  thenable.then(function (payload) {
    if (reply[kReplyHijacked] === true) {
      return
    }

    if (store) {
      channels.asyncStart.publish(store)
    }

    try {
      if (payload === undefined && reply.sent === false) {
        const method = reply.request.method
        const url = reply.request.routeOptions?.url || reply.request.url
        const routeKey = `${method} ${url}`

        if (!warnedRoutes.has(routeKey)) {
          warnedRoutes.add(routeKey)
          FSTWRN005(method, url)
        }
      }

      if (payload !== undefined || //
        (reply.sent === false && //
          reply.raw.headersSent === false &&
          reply.request.raw.aborted === false &&
          reply.request.socket &&
          !reply.request.socket.destroyed
        )
      ) {
        try {
          reply.send(payload)
        } catch (err) {
          reply[kReplyIsError] = true
          reply.send(err)
        }
      }
    } finally {
      if (store) {
        channels.asyncEnd.publish(store)
      }
    }
  }, function (err) {
    if (store) {
      store.error = err
      // Set status code before publishing so subscribers see the correct value
      setErrorStatusCode(reply, err)
      channels.error.publish(store) // note that error happens before asyncStart
      channels.asyncStart.publish(store)
    }

    try {
      if (reply.sent === true) {
        reply.log.error({ err }, 'Promise errored, but reply.sent = true was set')
        return
      }

      reply[kReplyIsError] = true

      reply.send(err)
      // The following should not happen
      /* c8 ignore next 3 */
    } catch (err) {
      // try-catch allow to re-throw error in error handler for async handler
      reply.send(err)
    } finally {
      if (store) {
        channels.asyncEnd.publish(store)
      }
    }
  })
}

module.exports = wrapThenable
module.exports.resetWarnedRoutes = function () {
  warnedRoutes.clear()
}
