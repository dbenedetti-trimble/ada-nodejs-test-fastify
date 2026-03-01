'use strict'

import * as http from 'http'
import Context from './context'

import FindMyWay from 'find-my-way'
import handleRequest from './handle-request'
import {
  onRequestAbortHookRunner,
  lifecycleHooks,
  preParsingHookRunner,
  onTimeoutHookRunner,
  onRequestHookRunner
} from './hooks'
import { normalizeSchema } from './schemas'
import { parseHeadOnSendHandlers } from './head-route'
import {
  compileSchemasForValidation,
  compileSchemasForSerialization
} from './validation'
import {
  FST_ERR_SCH_VALIDATION_BUILD,
  FST_ERR_SCH_SERIALIZATION_BUILD,
  FST_ERR_DUPLICATED_ROUTE,
  FST_ERR_INVALID_URL,
  FST_ERR_HOOK_INVALID_HANDLER,
  FST_ERR_ROUTE_OPTIONS_NOT_OBJ,
  FST_ERR_ROUTE_DUPLICATED_HANDLER,
  FST_ERR_ROUTE_HANDLER_NOT_FN,
  FST_ERR_ROUTE_MISSING_HANDLER,
  FST_ERR_ROUTE_METHOD_NOT_SUPPORTED,
  FST_ERR_ROUTE_METHOD_INVALID,
  FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED,
  FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT,
  FST_ERR_HOOK_INVALID_ASYNC_HANDLER
} from './errors'
import {
  kRoutePrefix,
  kSupportedHTTPMethods,
  kLogLevel,
  kLogSerializers,
  kHooks,
  kSchemaController,
  kOptions,
  kReplySerializerDefault,
  kReplyIsError,
  kRequestPayloadStream,
  kDisableRequestLogging,
  kSchemaErrorFormatter,
  kErrorHandler,
  kHasBeenDecorated,
  kRequestAcceptVersion,
  kRouteByFastify,
  kRouteContext
} from './symbols'
import { buildErrorHandler } from './error-handler'
import { createChildLogger } from './logger-factory'
import { getGenReqId } from './req-id-gen-factory'
import { FSTDEP022 } from './warnings'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface RoutingApi {
  setup: (options: FastifyServerOptions, fastifyArgs: FastifyArgs) => void
  routing: (req: http.IncomingMessage, res: http.ServerResponse) => void
  route: (opts: { options: RouteRegistrationOptions; isFastify: boolean }) => void
  hasRoute: (opts: { options: any }) => boolean
  prepareRoute: (opts: PrepareRouteOptions) => void
  routeHandler: (req: http.IncomingMessage, res: http.ServerResponse, params: any, context: any, query: any) => void
  closeRoutes: () => void
  printRoutes: (opts?: any) => string
  addConstraintStrategy: (strategy: any) => void
  hasConstraintStrategy: (strategyName: string) => boolean
  isAsyncConstraint: () => boolean
  findRoute: (opts: any) => any
}

interface FastifyServerOptions {
  logger?: any
  exposeHeadRoutes?: boolean
  disableRequestLogging?: boolean | ((req: any) => boolean)
  routerOptions: {
    ignoreTrailingSlash?: boolean
    ignoreDuplicateSlashes?: boolean
    [key: string]: any
  }
  return503OnClosing?: boolean
  [key: string]: any
}

interface FastifyArgs {
  avvio: any
  fourOhFour: any
  hasLogger: boolean
  setupResponseListeners: (reply: any) => void
  throwIfAlreadyStarted: (msg: string) => void
  keepAliveConnections: Set<any>
}

interface RouteRegistrationOptions {
  method: string | string[]
  url?: string
  path?: string
  handler?: (...args: any[]) => any
  schema?: any
  config?: any
  constraints?: Record<string, any>
  bodyLimit?: number
  logLevel?: string
  logSerializers?: any
  attachValidation?: boolean
  validatorCompiler?: any
  serializerCompiler?: any
  replySerializer?: any
  schemaErrorFormatter?: any
  exposeHeadRoute?: boolean
  prefixTrailingSlash?: string
  errorHandler?: (...args: any[]) => any
  childLoggerFactory?: any
  onRequest?: any
  preParsing?: any
  preValidation?: any
  preHandler?: any
  preSerialization?: any
  onSend?: any
  onResponse?: any
  onTimeout?: any
  onError?: any
  onRequestAbort?: any
  version?: string
  routePath?: string
  prefix?: string
  [key: string]: any
}

interface PrepareRouteOptions {
  method: string | string[]
  url: string
  options?: any
  handler?: (...args: any[]) => any
  isFastify?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const routerKeys = [
  'allowUnsafeRegex',
  'buildPrettyMeta',
  'caseSensitive',
  'constraints',
  'defaultRoute',
  'ignoreDuplicateSlashes',
  'ignoreTrailingSlash',
  'maxParamLength',
  'onBadUrl',
  'querystringParser',
  'useSemicolonDelimiter'
]

// ---------------------------------------------------------------------------
// buildRouting
// ---------------------------------------------------------------------------

function buildRouting (options: any): RoutingApi {
  const router = FindMyWay(options)

  let avvio: any
  let fourOhFour: any
  let logger: any
  let hasLogger: boolean
  let setupResponseListeners: (reply: any) => void
  let throwIfAlreadyStarted: (msg: string) => void
  let disableRequestLogging: boolean | ((req: any) => boolean) | undefined
  let disableRequestLoggingFn: ((req: any) => boolean) | undefined
  let ignoreTrailingSlash: boolean | undefined
  let ignoreDuplicateSlashes: boolean | undefined
  let return503OnClosing: boolean
  let globalExposeHeadRoutes: boolean
  let keepAliveConnections: Set<any>

  let closing = false

  return {
    /**
     * @param {import('../fastify').FastifyServerOptions} options
     * @param {*} fastifyArgs
     */
    setup (options: FastifyServerOptions, fastifyArgs: FastifyArgs): void {
      avvio = fastifyArgs.avvio
      fourOhFour = fastifyArgs.fourOhFour
      logger = options.logger
      hasLogger = fastifyArgs.hasLogger
      setupResponseListeners = fastifyArgs.setupResponseListeners
      throwIfAlreadyStarted = fastifyArgs.throwIfAlreadyStarted

      globalExposeHeadRoutes = options.exposeHeadRoutes as boolean
      disableRequestLogging = options.disableRequestLogging
      if (typeof disableRequestLogging === 'function') {
        disableRequestLoggingFn = options.disableRequestLogging as (req: any) => boolean
      }

      ignoreTrailingSlash = options.routerOptions.ignoreTrailingSlash
      ignoreDuplicateSlashes = options.routerOptions.ignoreDuplicateSlashes
      return503OnClosing = Object.hasOwn(options, 'return503OnClosing') ? options.return503OnClosing as boolean : true
      keepAliveConnections = fastifyArgs.keepAliveConnections
    },
    routing: router.lookup.bind(router),
    route,
    hasRoute,
    prepareRoute,
    routeHandler,
    closeRoutes: () => { closing = true },
    printRoutes: router.prettyPrint.bind(router),
    addConstraintStrategy,
    hasConstraintStrategy,
    isAsyncConstraint,
    findRoute
  }

  function addConstraintStrategy (strategy: any): void {
    throwIfAlreadyStarted('Cannot add constraint strategy!')
    return router.addConstraintStrategy(strategy)
  }

  function hasConstraintStrategy (strategyName: string): boolean {
    return router.hasConstraintStrategy(strategyName)
  }

  function isAsyncConstraint (): boolean {
    return (router as any).constrainer.asyncStrategiesInUse.size > 0
  }

  function prepareRoute (this: any, { method, url, options, handler, isFastify }: PrepareRouteOptions): void {
    if (typeof url !== 'string') {
      throw new FST_ERR_INVALID_URL(typeof url)
    }

    if (!handler && typeof options === 'function') {
      handler = options
      options = {}
    } else if (handler && typeof handler === 'function') {
      if (Object.prototype.toString.call(options) !== '[object Object]') {
        throw new FST_ERR_ROUTE_OPTIONS_NOT_OBJ(method as string, url)
      } else if (options.handler) {
        if (typeof options.handler === 'function') {
          throw new FST_ERR_ROUTE_DUPLICATED_HANDLER(method as string, url)
        } else {
          throw new FST_ERR_ROUTE_HANDLER_NOT_FN(method as string, url)
        }
      }
    }

    options = Object.assign({}, options, {
      method,
      url,
      path: url,
      handler: handler || (options && options.handler)
    })

    return route.call(this, { options, isFastify: isFastify ?? false })
  }

  function hasRoute (this: any, { options }: { options: any }): boolean {
    const normalizedMethod = options.method?.toUpperCase() ?? ''
    return router.hasRoute(
      normalizedMethod,
      options.url || '',
      options.constraints
    )
  }

  function findRoute (options: any): any {
    const route = router.find(
      options.method,
      options.url || '',
      options.constraints
    )
    if (route) {
      return {
        handler: route.handler,
        params: route.params,
        searchParams: (route as any).searchParams
      }
    } else {
      return null
    }
  }

  function route (this: any, { options, isFastify }: { options: RouteRegistrationOptions; isFastify: boolean }): any {
    throwIfAlreadyStarted('Cannot add route!')

    const opts: RouteRegistrationOptions = { ...options }

    const path = opts.url || opts.path || ''

    if (!opts.handler) {
      throw new FST_ERR_ROUTE_MISSING_HANDLER(opts.method as string, path)
    }

    if (opts.errorHandler !== undefined && typeof opts.errorHandler !== 'function') {
      throw new FST_ERR_ROUTE_HANDLER_NOT_FN(opts.method as string, path)
    }

    validateBodyLimitOption(opts.bodyLimit)

    const shouldExposeHead = opts.exposeHeadRoute ?? globalExposeHeadRoutes

    let isGetRoute = false
    let isHeadRoute = false

    if (Array.isArray(opts.method)) {
      for (let i = 0; i < opts.method.length; ++i) {
        opts.method[i] = normalizeAndValidateMethod.call(this, opts.method[i])
        validateSchemaBodyOption.call(this, opts.method[i], path, opts.schema)

        isGetRoute = opts.method.includes('GET')
        isHeadRoute = opts.method.includes('HEAD')
      }
    } else {
      opts.method = normalizeAndValidateMethod.call(this, opts.method)
      validateSchemaBodyOption.call(this, opts.method, path, opts.schema)

      isGetRoute = opts.method === 'GET'
      isHeadRoute = opts.method === 'HEAD'
    }

    const headOpts = shouldExposeHead && isGetRoute ? { ...options } : null

    const prefix: string = (this as any)[kRoutePrefix]

    if (path === '/' && prefix.length > 0 && opts.method !== 'HEAD') {
      switch (opts.prefixTrailingSlash) {
        case 'slash':
          addNewRoute.call(this, { path, isFastify })
          break
        case 'no-slash':
          addNewRoute.call(this, { path: '', isFastify })
          break
        case 'both':
        default:
          addNewRoute.call(this, { path: '', isFastify })
          if (ignoreTrailingSlash !== true && (ignoreDuplicateSlashes !== true || !prefix.endsWith('/'))) {
            addNewRoute.call(this, { path, prefixing: true, isFastify })
          }
      }
    } else if (path[0] === '/' && prefix.endsWith('/')) {
      addNewRoute.call(this, { path: path.slice(1), isFastify })
    } else {
      addNewRoute.call(this, { path, isFastify })
    }

    return this

    function addNewRoute (this: any, { path, prefixing = false, isFastify = false }: { path: string; prefixing?: boolean; isFastify?: boolean }): void {
      const url = prefix + path

      opts.url = url
      opts.path = url
      opts.routePath = path
      opts.prefix = prefix
      opts.logLevel = opts.logLevel || (this as any)[kLogLevel]

      if ((this as any)[kLogSerializers] || opts.logSerializers) {
        opts.logSerializers = Object.assign(Object.create((this as any)[kLogSerializers]), opts.logSerializers)
      }

      if (opts.attachValidation == null) {
        opts.attachValidation = false
      }

      if (prefixing === false) {
        for (const hook of (this as any)[kHooks].onRoute) {
          hook.call(this, opts)
        }
      }

      for (const hook of lifecycleHooks) {
        if (opts && hook in opts) {
          if (Array.isArray(opts[hook])) {
            for (const func of opts[hook]) {
              if (typeof func !== 'function') {
                throw new FST_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(func))
              }

              if (hook === 'onSend' || hook === 'preSerialization' || hook === 'onError' || hook === 'preParsing') {
                if (func.constructor.name === 'AsyncFunction' && func.length === 4) {
                  throw new FST_ERR_HOOK_INVALID_ASYNC_HANDLER()
                }
              } else if (hook === 'onRequestAbort') {
                if (func.constructor.name === 'AsyncFunction' && func.length !== 1) {
                  throw new FST_ERR_HOOK_INVALID_ASYNC_HANDLER()
                }
              } else {
                if (func.constructor.name === 'AsyncFunction' && func.length === 3) {
                  throw new FST_ERR_HOOK_INVALID_ASYNC_HANDLER()
                }
              }
            }
          } else if (opts[hook] !== undefined && typeof opts[hook] !== 'function') {
            throw new FST_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(opts[hook]))
          }
        }
      }

      const constraints = opts.constraints || {}
      const config = {
        ...opts.config,
        url,
        method: opts.method
      }

      const context = new Context({
        schema: opts.schema,
        handler: opts.handler!.bind(this),
        config,
        errorHandler: opts.errorHandler,
        childLoggerFactory: opts.childLoggerFactory,
        bodyLimit: opts.bodyLimit,
        logLevel: opts.logLevel,
        logSerializers: opts.logSerializers,
        attachValidation: opts.attachValidation,
        schemaErrorFormatter: opts.schemaErrorFormatter,
        replySerializer: (this as any)[kReplySerializerDefault],
        validatorCompiler: opts.validatorCompiler,
        serializerCompiler: opts.serializerCompiler,
        exposeHeadRoute: shouldExposeHead,
        prefixTrailingSlash: (opts.prefixTrailingSlash || 'both'),
        server: this,
        isFastify
      })

      const headHandler = router.findRoute('HEAD', opts.url!, constraints as any)
      const hasHEADHandler = headHandler !== null

      try {
        router.on(opts.method as any, opts.url!, { constraints } as any, routeHandler, context)
      } catch (error: any) {
        if (!(context as any)[kRouteByFastify]) {
          const isDuplicatedRoute = error.message.includes(`Method '${opts.method}' already declared for route`)
          if (isDuplicatedRoute) {
            throw new FST_ERR_DUPLICATED_ROUTE(opts.method as string, opts.url!)
          }

          throw error
        }
      }

      (this as any).after((notHandledErr: any, done: (err?: any) => void) => {
        context.errorHandler = opts.errorHandler
          ? buildErrorHandler((this as any)[kErrorHandler], opts.errorHandler)
          : (this as any)[kErrorHandler]
        context._parserOptions.limit = opts.bodyLimit || null
        context.logLevel = opts.logLevel
        context.logSerializers = opts.logSerializers
        context.attachValidation = opts.attachValidation
        context[kReplySerializerDefault as any] = (this as any)[kReplySerializerDefault]
        context.schemaErrorFormatter =
          opts.schemaErrorFormatter || (this as any)[kSchemaErrorFormatter] || context.schemaErrorFormatter

        avvio.once('preReady', () => {
          for (const hook of lifecycleHooks) {
            const toSet = (this as any)[kHooks][hook]
              .concat(opts[hook] || [])
              .map((h: any) => h.bind(this))
            context[hook] = toSet.length ? toSet : null
          }

          while (!context.Request[kHasBeenDecorated as any] && context.Request.parent) {
            context.Request = context.Request.parent
          }
          while (!context.Reply[kHasBeenDecorated as any] && context.Reply.parent) {
            context.Reply = context.Reply.parent
          }

          fourOhFour.setContext(this, context)

          if (opts.schema) {
            context.schema = normalizeSchema(context.schema, (this as any).initialConfig)

            const schemaController = (this as any)[kSchemaController]
            const hasValidationSchema = opts.schema.body ||
              opts.schema.headers ||
              opts.schema.querystring ||
              opts.schema.params
            if (!opts.validatorCompiler && hasValidationSchema) {
              schemaController.setupValidator((this as any)[kOptions])
            }
            try {
              const isCustom = typeof opts?.validatorCompiler === 'function' ||
                schemaController.isCustomValidatorCompiler
              compileSchemasForValidation(
                context,
                opts.validatorCompiler || schemaController.validatorCompiler,
                isCustom
              )
            } catch (error: any) {
              throw new FST_ERR_SCH_VALIDATION_BUILD(opts.method as string, url, error.message)
            }

            if (opts.schema.response && !opts.serializerCompiler) {
              schemaController.setupSerializer((this as any)[kOptions])
            }
            try {
              compileSchemasForSerialization(context, opts.serializerCompiler || schemaController.serializerCompiler)
            } catch (error: any) {
              throw new FST_ERR_SCH_SERIALIZATION_BUILD(opts.method as string, url, error.message)
            }
          }
        })

        done(notHandledErr)
      })

      if (shouldExposeHead && isGetRoute && !isHeadRoute && !hasHEADHandler) {
        const onSendHandlers = parseHeadOnSendHandlers(headOpts!.onSend)
        prepareRoute.call(this, { method: 'HEAD', url: path, options: { ...headOpts!, onSend: onSendHandlers }, isFastify: true })
      }
    }
  }

  function routeHandler (req: http.IncomingMessage, res: http.ServerResponse, params: any, context: any, query: any): void {
    const id = getGenReqId(context.server, req)

    const loggerOpts: any = {
      level: context.logLevel
    }

    if (context.logSerializers) {
      loggerOpts.serializers = context.logSerializers
    }
    const childLogger = createChildLogger(context, logger, req, id, loggerOpts)
    childLogger[kDisableRequestLogging as any] = disableRequestLoggingFn ? false : disableRequestLogging

    if (closing === true) {
      /* istanbul ignore next mac, windows */
      if ((req as any).httpVersionMajor !== 2) {
        res.setHeader('Connection', 'close')
      }

      /* istanbul ignore else */
      if (return503OnClosing) {
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': '80'
        }
        res.writeHead(503, headers)
        res.end('{"error":"Service Unavailable","message":"Service Unavailable","statusCode":503}')
        childLogger.info({ res: { statusCode: 503 } }, 'request aborted - refusing to accept new requests as server is closing')
        return
      }
    }

    const connHeader = String.prototype.toLowerCase.call((req.headers as any).connection || '')
    if (connHeader === 'keep-alive') {
      if (keepAliveConnections.has((req as any).socket) === false) {
        keepAliveConnections.add((req as any).socket)
        ;(req as any).socket.on('close', removeTrackedSocket.bind({ keepAliveConnections, socket: (req as any).socket }))
      }
    }

    if ((req.headers as any)[kRequestAcceptVersion as any] !== undefined) {
      (req.headers as any)['accept-version'] = (req.headers as any)[kRequestAcceptVersion as any]
      ;(req.headers as any)[kRequestAcceptVersion as any] = undefined
    }

    const request = new context.Request(id, params, req, query, childLogger, context)
    const reply = new context.Reply(res, request, childLogger)

    const resolvedDisableRequestLogging = disableRequestLoggingFn
      ? disableRequestLoggingFn(request)
      : disableRequestLogging
    childLogger[kDisableRequestLogging as any] = resolvedDisableRequestLogging

    if (resolvedDisableRequestLogging === false) {
      childLogger.info({ req: request }, 'incoming request')
    }

    if (hasLogger === true || context.onResponse !== null) {
      setupResponseListeners(reply)
    }

    if (context.onRequest !== null) {
      onRequestHookRunner(
        context.onRequest,
        request,
        reply,
        runPreParsing
      )
    } else {
      runPreParsing(null, request, reply)
    }

    if (context.onRequestAbort !== null) {
      req.on('close', () => {
        /* istanbul ignore else */
        if ((req as any).aborted) {
          onRequestAbortHookRunner(
            context.onRequestAbort,
            request,
            handleOnRequestAbortHooksErrors.bind(null, reply)
          )
        }
      })
    }

    if (context.onTimeout !== null) {
      if (!(request.raw.socket as any)._meta) {
        request.raw.socket.on('timeout', handleTimeout)
      }
      (request.raw.socket as any)._meta = { context, request, reply }
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function handleOnRequestAbortHooksErrors (reply: any, err: any): void {
  if (err) {
    reply.log.error({ err }, 'onRequestAborted hook failed')
  }
}

function handleTimeout (this: any): void {
  const { context, request, reply } = this._meta
  onTimeoutHookRunner(
    context.onTimeout,
    request,
    reply,
    noop
  )
}

function normalizeAndValidateMethod (this: any, method: any): string {
  if (typeof method !== 'string') {
    throw new FST_ERR_ROUTE_METHOD_INVALID()
  }
  method = method.toUpperCase()
  if (!(this as any)[kSupportedHTTPMethods].bodyless.has(method) &&
    !(this as any)[kSupportedHTTPMethods].bodywith.has(method)) {
    throw new FST_ERR_ROUTE_METHOD_NOT_SUPPORTED(method)
  }

  return method
}

function validateSchemaBodyOption (this: any, method: string, path: string, schema: any): void {
  if ((this as any)[kSupportedHTTPMethods].bodyless.has(method) && schema?.body) {
    throw new FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED(method, path)
  }
}

function validateBodyLimitOption (bodyLimit: any): void {
  if (bodyLimit === undefined) return
  if (!Number.isInteger(bodyLimit) || bodyLimit <= 0) {
    throw new FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT(bodyLimit)
  }
}

function runPreParsing (err: any, request: any, reply: any): void {
  if (reply.sent === true) return
  if (err != null) {
    reply[kReplyIsError as any] = true
    reply.send(err)
    return
  }

  request[kRequestPayloadStream as any] = request.raw

  if (request[kRouteContext as any].preParsing !== null) {
    preParsingHookRunner(request[kRouteContext as any].preParsing, request, reply, handleRequest.bind(request.server))
  } else {
    handleRequest.call(request.server, null, request, reply)
  }
}

function buildRouterOptions (options: any, defaultOptions: any): Record<string, any> {
  const routerOptions = options.routerOptions == null
    ? Object.create(null)
    : Object.assign(Object.create(null), options.routerOptions)

  const usedDeprecatedOptions = routerKeys.filter(key => Object.hasOwn(options, key))

  if (usedDeprecatedOptions.length > 0) {
    FSTDEP022(usedDeprecatedOptions.join(', '))
  }

  for (const key of routerKeys) {
    if (!Object.hasOwn(routerOptions, key)) {
      routerOptions[key] = options[key] ?? defaultOptions[key]
    }
  }

  return routerOptions
}

/**
 * Used within the route handler as a `net.Socket.close` event handler.
 * The purpose is to remove a socket from the tracked sockets collection when
 * the socket has naturally timed out.
 */
function removeTrackedSocket (this: { keepAliveConnections: Set<any>; socket: any }): void {
  this.keepAliveConnections.delete(this.socket)
}

function noop (): void { }

export { buildRouting, validateBodyLimitOption, buildRouterOptions }
