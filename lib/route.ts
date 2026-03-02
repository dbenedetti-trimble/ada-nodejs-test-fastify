import FindMyWay = require('find-my-way')
import Context = require('./context')
import handleRequest = require('./handle-request')
import { onRequestAbortHookRunner, lifecycleHooks, preParsingHookRunner, onTimeoutHookRunner, onRequestHookRunner } from './hooks'
import { normalizeSchema } from './schemas'
import { parseHeadOnSendHandlers } from './head-route'
import { compileSchemasForValidation, compileSchemasForSerialization } from './validation'
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

function buildRouting(options: any): any {
  const router: any = FindMyWay(options)

  let avvio: any
  let fourOhFour: any
  let logger: any
  let hasLogger: boolean
  let setupResponseListeners: Function
  let throwIfAlreadyStarted: (msg: string) => void
  let disableRequestLogging: any
  let disableRequestLoggingFn: Function | undefined
  let ignoreTrailingSlash: boolean
  let ignoreDuplicateSlashes: boolean
  let return503OnClosing: boolean
  let globalExposeHeadRoutes: boolean
  let keepAliveConnections: Set<any>

  let closing = false

  return {
    setup(options: any, fastifyArgs: any): void {
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

  function addConstraintStrategy(this: any, strategy: any): any {
    throwIfAlreadyStarted('Cannot add constraint strategy!')
    return router.addConstraintStrategy(strategy)
  }

  function hasConstraintStrategy(this: any, strategyName: string): boolean {
    return router.hasConstraintStrategy(strategyName)
  }

  function isAsyncConstraint(this: any): boolean {
    return router.constrainer.asyncStrategiesInUse.size > 0
  }

  function prepareRoute(this: any, { method, url, options, handler, isFastify }: any): any {
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

    return route.call(this, { options, isFastify })
  }

  function hasRoute(this: any, { options }: any): boolean {
    const normalizedMethod: string = options.method?.toUpperCase() ?? ''
    return router.hasRoute(
      normalizedMethod,
      options.url || '',
      options.constraints
    )
  }

  function findRoute(this: any, options: any): any {
    const foundRoute = router.find(
      options.method,
      options.url || '',
      options.constraints
    )
    if (foundRoute) {
      return {
        handler: foundRoute.handler,
        params: foundRoute.params,
        searchParams: foundRoute.searchParams
      }
    } else {
      return null
    }
  }

  function route(this: any, { options, isFastify }: any): any {
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

    const headOpts: any = shouldExposeHead && isGetRoute ? { ...options } : null

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

    function addNewRoute(this: any, { path, prefixing = false, isFastify = false }: any): void {
      const url: string = prefix + path

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

      const constraints: any = opts.constraints || {}
      const config: any = {
        ...opts.config,
        url,
        method: opts.method
      }

      const context: any = new (Context as any)({
        schema: opts.schema,
        handler: opts.handler.bind(this),
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

      const headHandler: any = router.findRoute('HEAD', opts.url, constraints)
      const hasHEADHandler: boolean = headHandler !== null

      try {
        router.on(opts.method, opts.url, { constraints }, routeHandler, context)
      } catch (error: any) {
        if (!context[kRouteByFastify]) {
          const isDuplicatedRoute: boolean = error.message.includes(`Method '${opts.method}' already declared for route`)
          if (isDuplicatedRoute) {
            throw new FST_ERR_DUPLICATED_ROUTE(opts.method, opts.url)
          }

          throw error
        }
      }

      this.after((notHandledErr: any, done: Function) => {
        context.errorHandler = opts.errorHandler
          ? buildErrorHandler((this as any)[kErrorHandler], opts.errorHandler)
          : (this as any)[kErrorHandler]
        context._parserOptions.limit = opts.bodyLimit || null
        context.logLevel = opts.logLevel
        context.logSerializers = opts.logSerializers
        context.attachValidation = opts.attachValidation
        context[kReplySerializerDefault] = (this as any)[kReplySerializerDefault]
        context.schemaErrorFormatter =
          opts.schemaErrorFormatter || (this as any)[kSchemaErrorFormatter] || context.schemaErrorFormatter

        avvio.once('preReady', () => {
          for (const hook of lifecycleHooks) {
            const toSet: any[] = (this as any)[kHooks][hook]
              .concat(opts[hook] || [])
              .map((h: Function) => h.bind(this))
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

            const schemaController: any = (this as any)[kSchemaController]
            const hasValidationSchema: any = opts.schema.body ||
              opts.schema.headers ||
              opts.schema.querystring ||
              opts.schema.params
            if (!opts.validatorCompiler && hasValidationSchema) {
              schemaController.setupValidator((this as any)[kOptions])
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
              schemaController.setupSerializer((this as any)[kOptions])
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
        const onSendHandlers: any = parseHeadOnSendHandlers(headOpts.onSend)
        prepareRoute.call(this, { method: 'HEAD', url: path, options: { ...headOpts, onSend: onSendHandlers }, isFastify: true })
      }
    }
  }

  function routeHandler(this: any, req: any, res: any, params: any, context: any, query: any): void {
    const id: any = getGenReqId(context.server, req)

    const loggerOpts: any = {
      level: context.logLevel
    }

    if (context.logSerializers) {
      loggerOpts.serializers = context.logSerializers
    }
    const childLogger: any = createChildLogger(context, logger, req, id, loggerOpts)
    childLogger[kDisableRequestLogging] = disableRequestLoggingFn ? false : disableRequestLogging

    if (closing === true) {
      /* istanbul ignore next mac, windows */
      if (req.httpVersionMajor !== 2) {
        res.setHeader('Connection', 'close')
      }

      /* istanbul ignore else */
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

    const request: any = new context.Request(id, params, req, query, childLogger, context)
    const reply: any = new context.Reply(res, request, childLogger)

    const resolvedDisableRequestLogging: any = disableRequestLoggingFn
      ? disableRequestLoggingFn(request)
      : disableRequestLogging
    childLogger[kDisableRequestLogging] = resolvedDisableRequestLogging

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

function handleOnRequestAbortHooksErrors(reply: any, err: any): void {
  if (err) {
    reply.log.error({ err }, 'onRequestAborted hook failed')
  }
}

function handleTimeout(this: any): void {
  const { context, request, reply } = this._meta
  onTimeoutHookRunner(
    context.onTimeout,
    request,
    reply,
    noop
  )
}

function normalizeAndValidateMethod(this: any, method: any): string {
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

function validateSchemaBodyOption(this: any, method: string, path: string, schema: any): void {
  if ((this as any)[kSupportedHTTPMethods].bodyless.has(method) && schema?.body) {
    throw new FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED(method, path)
  }
}

function validateBodyLimitOption(bodyLimit: any): void {
  if (bodyLimit === undefined) return
  if (!Number.isInteger(bodyLimit) || bodyLimit <= 0) {
    throw new FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT(bodyLimit)
  }
}

function runPreParsing(err: any, request: any, reply: any): void {
  if (reply.sent === true) return
  if (err != null) {
    (reply as any)[kReplyIsError] = true
    reply.send(err)
    return
  }

  (request as any)[kRequestPayloadStream] = request.raw

  if ((request as any)[kRouteContext].preParsing !== null) {
    preParsingHookRunner((request as any)[kRouteContext].preParsing, request, reply, handleRequest.bind(request.server))
  } else {
    handleRequest.call(request.server, null, request, reply)
  }
}

function buildRouterOptions(options: any, defaultOptions: any): Record<string, any> {
  const routerOptions: Record<string, any> = options.routerOptions == null
    ? Object.create(null)
    : Object.assign(Object.create(null), options.routerOptions)

  const usedDeprecatedOptions: string[] = routerKeys.filter(key => Object.hasOwn(options, key))

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

function removeTrackedSocket(this: { keepAliveConnections: Set<any>; socket: any }): void {
  this.keepAliveConnections.delete(this.socket)
}

function noop(): void { }

module.exports = { buildRouting, validateBodyLimitOption, buildRouterOptions }
