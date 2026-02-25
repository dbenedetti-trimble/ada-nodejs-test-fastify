'use strict'

import FindMyWay = require('find-my-way')
import Context = require('./context')
import handleRequest = require('./handle-request')
import { onRequestAbortHookRunner, lifecycleHooks, preParsingHookRunner, onTimeoutHookRunner, onRequestHookRunner } from './hooks'
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

const routerKeys: string[] = [
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

interface RouteRegistrationOptions {
  options: any
  isFastify: boolean
}

interface PrepareRouteOptions {
  method: string | string[]
  url: string
  options?: any
  handler?: Function
  isFastify?: boolean
}

interface HasRouteOptions {
  options: any
}

interface FindRouteOptions {
  method: string
  url: string
  constraints?: any
}

interface RoutingApi {
  setup: (options: any, fastifyArgs: any) => void
  routing: any
  route: (opts: RouteRegistrationOptions) => any
  hasRoute: (opts: HasRouteOptions) => boolean
  prepareRoute: (opts: PrepareRouteOptions) => any
  routeHandler: (req: any, res: any, params: any, context: any, query: any) => void
  closeRoutes: () => void
  printRoutes: (opts?: any) => string
  addConstraintStrategy: (strategy: any) => any
  hasConstraintStrategy: (strategyName: string) => boolean
  isAsyncConstraint: () => boolean
  findRoute: (opts: FindRouteOptions) => any
}

function buildRouting (options: any): RoutingApi {
  const router = FindMyWay(options)

  let avvio: any
  let fourOhFour: any
  let logger: any
  let hasLogger: boolean
  let setupResponseListeners: any
  let throwIfAlreadyStarted: any
  let disableRequestLogging: boolean | ((request: any) => boolean)
  let disableRequestLoggingFn: ((request: any) => boolean) | undefined
  let ignoreTrailingSlash: boolean
  let ignoreDuplicateSlashes: boolean
  let return503OnClosing: boolean
  let globalExposeHeadRoutes: boolean
  let keepAliveConnections: any

  let closing: boolean = false

  return {
    setup (options: any, fastifyArgs: any): void {
      avvio = fastifyArgs.avvio
      fourOhFour = fastifyArgs.fourOhFour
      logger = options.logger
      hasLogger = fastifyArgs.hasLogger
      setupResponseListeners = fastifyArgs.setupResponseListeners
      throwIfAlreadyStarted = fastifyArgs.throwIfAlreadyStarted

      globalExposeHeadRoutes = options.exposeHeadRoutes
      disableRequestLogging = options.disableRequestLogging
      if (typeof disableRequestLogging === 'function') {
        disableRequestLoggingFn = options.disableRequestLogging
      }

      ignoreTrailingSlash = options.routerOptions.ignoreTrailingSlash
      ignoreDuplicateSlashes = options.routerOptions.ignoreDuplicateSlashes
      return503OnClosing = Object.hasOwn(options, 'return503OnClosing') ? options.return503OnClosing : true
      keepAliveConnections = fastifyArgs.keepAliveConnections
    },
    routing: router.lookup.bind(router),
    route,
    hasRoute,
    prepareRoute,
    routeHandler,
    closeRoutes: (): void => { closing = true },
    printRoutes: router.prettyPrint.bind(router),
    addConstraintStrategy,
    hasConstraintStrategy,
    isAsyncConstraint,
    findRoute
  }

  function addConstraintStrategy (strategy: any): any {
    throwIfAlreadyStarted('Cannot add constraint strategy!')
    return router.addConstraintStrategy(strategy)
  }

  function hasConstraintStrategy (strategyName: string): boolean {
    return router.hasConstraintStrategy(strategyName)
  }

  function isAsyncConstraint (): boolean {
    return (router as any).constrainer.asyncStrategiesInUse.size > 0
  }

  function prepareRoute (this: any, { method, url, options, handler, isFastify }: PrepareRouteOptions): any {
    if (typeof url !== 'string') {
      throw new FST_ERR_INVALID_URL(typeof url)
    }

    if (!handler && typeof options === 'function') {
      handler = options
      options = {}
    } else if (handler && typeof handler === 'function') {
      if (Object.prototype.toString.call(options) !== '[object Object]') {
        throw new FST_ERR_ROUTE_OPTIONS_NOT_OBJ(method, url)
      } else if (options.handler) {
        if (typeof options.handler === 'function') {
          throw new FST_ERR_ROUTE_DUPLICATED_HANDLER(method, url)
        } else {
          throw new FST_ERR_ROUTE_HANDLER_NOT_FN(method, url)
        }
      }
    }

    options = Object.assign({}, options, {
      method,
      url,
      path: url,
      handler: handler || (options && options.handler)
    })

    return route.call(this, { options, isFastify: isFastify || false })
  }

  function hasRoute ({ options }: HasRouteOptions): boolean {
    const normalizedMethod: string = options.method?.toUpperCase() ?? ''
    return (router as any).hasRoute(
      normalizedMethod,
      options.url || '',
      options.constraints
    )
  }

  function findRoute (options: FindRouteOptions): any {
    const route = (router as any).find(
      options.method,
      options.url || '',
      options.constraints
    )
    if (route) {
      return {
        handler: route.handler,
        params: route.params,
        searchParams: route.searchParams
      }
    } else {
      return null
    }
  }

  function route (this: any, { options, isFastify }: RouteRegistrationOptions): any {
    throwIfAlreadyStarted('Cannot add route!')

    const opts: any = { ...options }

    const path: string = opts.url || opts.path || ''

    if (!opts.handler) {
      throw new FST_ERR_ROUTE_MISSING_HANDLER(opts.method, path)
    }

    if (opts.errorHandler !== undefined && typeof opts.errorHandler !== 'function') {
      throw new FST_ERR_ROUTE_HANDLER_NOT_FN(opts.method, path)
    }

    validateBodyLimitOption(opts.bodyLimit)

    const shouldExposeHead: boolean = opts.exposeHeadRoute ?? globalExposeHeadRoutes

    let isGetRoute: boolean = false
    let isHeadRoute: boolean = false

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

    const headOpts: any = shouldExposeHead && isGetRoute ? { ...options } : null

    const prefix: string = this[kRoutePrefix]

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

    function addNewRoute (
      this: any,
      { path, prefixing = false, isFastify = false }: { path: string, prefixing?: boolean, isFastify?: boolean }
    ): void {
      const url: string = prefix + path

      opts.url = url
      opts.path = url
      opts.routePath = path
      opts.prefix = prefix
      opts.logLevel = opts.logLevel || this[kLogLevel]

      if (this[kLogSerializers] || opts.logSerializers) {
        opts.logSerializers = Object.assign(Object.create(this[kLogSerializers]), opts.logSerializers)
      }

      if (opts.attachValidation == null) {
        opts.attachValidation = false
      }

      if (prefixing === false) {
        for (const hook of this[kHooks].onRoute) {
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

      const constraints: any = opts.constraints || {}
      const config: any = {
        ...opts.config,
        url,
        method: opts.method
      }

      const context: any = new Context({
        schema: opts.schema,
        handler: opts.handler.bind(this),
        config,
        requestIdLogLabel: undefined,
        childLoggerFactory: opts.childLoggerFactory,
        errorHandler: opts.errorHandler,
        bodyLimit: opts.bodyLimit,
        logLevel: opts.logLevel,
        logSerializers: opts.logSerializers,
        attachValidation: opts.attachValidation,
        validatorCompiler: opts.validatorCompiler,
        serializerCompiler: opts.serializerCompiler,
        replySerializer: this[kReplySerializerDefault],
        schemaErrorFormatter: opts.schemaErrorFormatter,
        exposeHeadRoute: shouldExposeHead,
        prefixTrailingSlash: (opts.prefixTrailingSlash || 'both'),
        server: this,
        isFastify
      })

      const headHandler = (router as any).findRoute('HEAD', opts.url, constraints)
      const hasHEADHandler: boolean = headHandler !== null

      try {
        (router as any).on(opts.method, opts.url, { constraints }, routeHandler, context)
      } catch (error: any) {
        if (!context[kRouteByFastify]) {
          const isDuplicatedRoute: boolean = error.message.includes(`Method '${opts.method}' already declared for route`)
          if (isDuplicatedRoute) {
            throw new FST_ERR_DUPLICATED_ROUTE(opts.method, opts.url)
          }

          throw error
        }
      }

      this.after((notHandledErr: any, done: any) => {
        context.errorHandler = opts.errorHandler
          ? buildErrorHandler(this[kErrorHandler], opts.errorHandler)
          : this[kErrorHandler]
        context._parserOptions.limit = opts.bodyLimit || null
        context.logLevel = opts.logLevel
        context.logSerializers = opts.logSerializers
        context.attachValidation = opts.attachValidation
        context[kReplySerializerDefault] = this[kReplySerializerDefault]
        context.schemaErrorFormatter =
          opts.schemaErrorFormatter || this[kSchemaErrorFormatter] || context.schemaErrorFormatter

        avvio.once('preReady', () => {
          for (const hook of lifecycleHooks) {
            const toSet = this[kHooks][hook]
              .concat(opts[hook] || [])
              .map((h: any) => h.bind(this))
            context[hook] = toSet.length ? toSet : null
          }

          while (!context.Request[kHasBeenDecorated] && context.Request.parent) {
            context.Request = context.Request.parent
          }
          while (!context.Reply[kHasBeenDecorated] && context.Reply.parent) {
            context.Reply = context.Reply.parent
          }

          fourOhFour.setContext(this, context)

          if (opts.schema) {
            context.schema = normalizeSchema(context.schema, this.initialConfig)

            const schemaController = this[kSchemaController]
            const hasValidationSchema: boolean = opts.schema.body ||
              opts.schema.headers ||
              opts.schema.querystring ||
              opts.schema.params
            if (!opts.validatorCompiler && hasValidationSchema) {
              schemaController.setupValidator(this[kOptions])
            }
            try {
              const isCustom: boolean = typeof opts?.validatorCompiler === 'function' ||
                schemaController.isCustomValidatorCompiler
              compileSchemasForValidation(
                context,
                opts.validatorCompiler || schemaController.validatorCompiler,
                isCustom
              )
            } catch (error: any) {
              throw new FST_ERR_SCH_VALIDATION_BUILD(opts.method, url, error.message)
            }

            if (opts.schema.response && !opts.serializerCompiler) {
              schemaController.setupSerializer(this[kOptions])
            }
            try {
              compileSchemasForSerialization(context, opts.serializerCompiler || schemaController.serializerCompiler)
            } catch (error: any) {
              throw new FST_ERR_SCH_SERIALIZATION_BUILD(opts.method, url, error.message)
            }
          }
        })

        done(notHandledErr)
      })

      if (shouldExposeHead && isGetRoute && !isHeadRoute && !hasHEADHandler) {
        const onSendHandlers = parseHeadOnSendHandlers(headOpts.onSend)
        prepareRoute.call(this, { method: 'HEAD', url: path, options: { ...headOpts, onSend: onSendHandlers }, isFastify: true })
      }
    }
  }

  function routeHandler (req: any, res: any, params: any, context: any, query: any): void {
    const id: string = getGenReqId(context.server, req)

    const loggerOpts: any = {
      level: context.logLevel
    }

    if (context.logSerializers) {
      loggerOpts.serializers = context.logSerializers
    }
    const childLogger: any = createChildLogger(context, logger, req, id, loggerOpts)
    ;(childLogger as any)[kDisableRequestLogging] = disableRequestLoggingFn ? false : disableRequestLogging

    if (closing === true) {
      if (req.httpVersionMajor !== 2) {
        res.setHeader('Connection', 'close')
      }

      if (return503OnClosing) {
        const headers: any = {
          'Content-Type': 'application/json',
          'Content-Length': '80'
        }
        res.writeHead(503, headers)
        res.end('{"error":"Service Unavailable","message":"Service Unavailable","statusCode":503}')
        childLogger.info({ res: { statusCode: 503 } }, 'request aborted - refusing to accept new requests as server is closing')
        return
      }
    }

    const connHeader: string = String.prototype.toLowerCase.call(req.headers.connection || '')
    if (connHeader === 'keep-alive') {
      if (keepAliveConnections.has(req.socket) === false) {
        keepAliveConnections.add(req.socket)
        req.socket.on('close', removeTrackedSocket.bind({ keepAliveConnections, socket: req.socket }))
      }
    }

    if (req.headers[kRequestAcceptVersion] !== undefined) {
      req.headers['accept-version'] = req.headers[kRequestAcceptVersion]
      req.headers[kRequestAcceptVersion] = undefined
    }

    const request = new context.Request(id, params, req, query, childLogger, context)
    const reply = new context.Reply(res, request, childLogger)

    const resolvedDisableRequestLogging: boolean | ((request: any) => boolean) = disableRequestLoggingFn
      ? disableRequestLoggingFn(request)
      : disableRequestLogging
    ;(childLogger as any)[kDisableRequestLogging] = resolvedDisableRequestLogging

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
        if (req.aborted) {
          onRequestAbortHookRunner(
            context.onRequestAbort,
            request,
            handleOnRequestAbortHooksErrors.bind(null, reply)
          )
        }
      })
    }

    if (context.onTimeout !== null) {
      if (!request.raw.socket._meta) {
        request.raw.socket.on('timeout', handleTimeout)
      }
      request.raw.socket._meta = { context, request, reply }
    }
  }
}

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
  if (!this[kSupportedHTTPMethods].bodyless.has(method) &&
    !this[kSupportedHTTPMethods].bodywith.has(method)) {
    throw new FST_ERR_ROUTE_METHOD_NOT_SUPPORTED(method)
  }

  return method
}

function validateSchemaBodyOption (this: any, method: string, path: string, schema: any): void {
  if (this[kSupportedHTTPMethods].bodyless.has(method) && schema?.body) {
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
    ;(reply as any)[kReplyIsError] = true
    reply.send(err)
    return
  }

  ;(request as any)[kRequestPayloadStream] = request.raw

  if ((request as any)[kRouteContext].preParsing !== null) {
    preParsingHookRunner((request as any)[kRouteContext].preParsing, request, reply, handleRequest.bind(request.server))
  } else {
    handleRequest.call(request.server, null, request, reply)
  }
}

function buildRouterOptions (options: any, defaultOptions: any): any {
  const routerOptions: any = options.routerOptions == null
    ? Object.create(null)
    : Object.assign(Object.create(null), options.routerOptions)

  const usedDeprecatedOptions: string[] = routerKeys.filter((key: string) => Object.hasOwn(options, key))

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

function removeTrackedSocket (this: any): void {
  this.keepAliveConnections.delete(this.socket)
}

function noop (): void { }

export = { buildRouting, validateBodyLimitOption, buildRouterOptions }
