'use strict'

const {
  kReplyIsError,
  kReplyHijacked,
  kRouteContext
} = require('./symbols')
const { setErrorStatusCode } = require('./error-status')
const { FSTWRN005 } = require('./warnings')

const diagnostics = require('node:diagnostics_channel')
const channels = diagnostics.tracingChannel('fastify.request.handler')

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
      if (payload !== undefined || //
        (reply.sent === false && //
          reply.raw.headersSent === false &&
          reply.request.raw.aborted === false &&
          reply.request.socket &&
          !reply.request.socket.destroyed
        )
      ) {
        if (payload === undefined && reply.sent === false) {
          const context = reply[kRouteContext]
          if (context && context.config) {
            FSTWRN005(context.config.method, context.config.url)
          }
        }

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
