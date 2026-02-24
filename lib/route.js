'use strict';
const FindMyWay = require("find-my-way");
const Context = require("./context");
const handleRequest = require("./handle-request");
const hooks_1 = require("./hooks");
const schemas_1 = require("./schemas");
const head_route_1 = require("./head-route");
const validation_1 = require("./validation");
const errors_1 = require("./errors");
const symbols_1 = require("./symbols");
const error_handler_1 = require("./error-handler");
const logger_factory_1 = require("./logger-factory");
const req_id_gen_factory_1 = require("./req-id-gen-factory");
const warnings_1 = require("./warnings");
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
];
function buildRouting(options) {
    const router = FindMyWay(options);
    let avvio;
    let fourOhFour;
    let logger;
    let hasLogger;
    let setupResponseListeners;
    let throwIfAlreadyStarted;
    let disableRequestLogging;
    let disableRequestLoggingFn;
    let ignoreTrailingSlash;
    let ignoreDuplicateSlashes;
    let return503OnClosing;
    let globalExposeHeadRoutes;
    let keepAliveConnections;
    let closing = false;
    return {
        setup(options, fastifyArgs) {
            avvio = fastifyArgs.avvio;
            fourOhFour = fastifyArgs.fourOhFour;
            logger = options.logger;
            hasLogger = fastifyArgs.hasLogger;
            setupResponseListeners = fastifyArgs.setupResponseListeners;
            throwIfAlreadyStarted = fastifyArgs.throwIfAlreadyStarted;
            globalExposeHeadRoutes = options.exposeHeadRoutes;
            disableRequestLogging = options.disableRequestLogging;
            if (typeof disableRequestLogging === 'function') {
                disableRequestLoggingFn = options.disableRequestLogging;
            }
            ignoreTrailingSlash = options.routerOptions.ignoreTrailingSlash;
            ignoreDuplicateSlashes = options.routerOptions.ignoreDuplicateSlashes;
            return503OnClosing = Object.hasOwn(options, 'return503OnClosing') ? options.return503OnClosing : true;
            keepAliveConnections = fastifyArgs.keepAliveConnections;
        },
        routing: router.lookup.bind(router),
        route,
        hasRoute,
        prepareRoute,
        routeHandler,
        closeRoutes: () => { closing = true; },
        printRoutes: router.prettyPrint.bind(router),
        addConstraintStrategy,
        hasConstraintStrategy,
        isAsyncConstraint,
        findRoute
    };
    function addConstraintStrategy(strategy) {
        throwIfAlreadyStarted('Cannot add constraint strategy!');
        return router.addConstraintStrategy(strategy);
    }
    function hasConstraintStrategy(strategyName) {
        return router.hasConstraintStrategy(strategyName);
    }
    function isAsyncConstraint() {
        return router.constrainer.asyncStrategiesInUse.size > 0;
    }
    function prepareRoute({ method, url, options, handler, isFastify }) {
        if (typeof url !== 'string') {
            throw new errors_1.FST_ERR_INVALID_URL(typeof url);
        }
        if (!handler && typeof options === 'function') {
            handler = options;
            options = {};
        }
        else if (handler && typeof handler === 'function') {
            if (Object.prototype.toString.call(options) !== '[object Object]') {
                throw new errors_1.FST_ERR_ROUTE_OPTIONS_NOT_OBJ(method, url);
            }
            else if (options.handler) {
                if (typeof options.handler === 'function') {
                    throw new errors_1.FST_ERR_ROUTE_DUPLICATED_HANDLER(method, url);
                }
                else {
                    throw new errors_1.FST_ERR_ROUTE_HANDLER_NOT_FN(method, url);
                }
            }
        }
        options = Object.assign({}, options, {
            method,
            url,
            path: url,
            handler: handler || (options && options.handler)
        });
        return route.call(this, { options, isFastify: isFastify || false });
    }
    function hasRoute({ options }) {
        const normalizedMethod = options.method?.toUpperCase() ?? '';
        return router.hasRoute(normalizedMethod, options.url || '', options.constraints);
    }
    function findRoute(options) {
        const route = router.find(options.method, options.url || '', options.constraints);
        if (route) {
            return {
                handler: route.handler,
                params: route.params,
                searchParams: route.searchParams
            };
        }
        else {
            return null;
        }
    }
    function route({ options, isFastify }) {
        throwIfAlreadyStarted('Cannot add route!');
        const opts = { ...options };
        const path = opts.url || opts.path || '';
        if (!opts.handler) {
            throw new errors_1.FST_ERR_ROUTE_MISSING_HANDLER(opts.method, path);
        }
        if (opts.errorHandler !== undefined && typeof opts.errorHandler !== 'function') {
            throw new errors_1.FST_ERR_ROUTE_HANDLER_NOT_FN(opts.method, path);
        }
        validateBodyLimitOption(opts.bodyLimit);
        const shouldExposeHead = opts.exposeHeadRoute ?? globalExposeHeadRoutes;
        let isGetRoute = false;
        let isHeadRoute = false;
        if (Array.isArray(opts.method)) {
            for (let i = 0; i < opts.method.length; ++i) {
                opts.method[i] = normalizeAndValidateMethod.call(this, opts.method[i]);
                validateSchemaBodyOption.call(this, opts.method[i], path, opts.schema);
                isGetRoute = opts.method.includes('GET');
                isHeadRoute = opts.method.includes('HEAD');
            }
        }
        else {
            opts.method = normalizeAndValidateMethod.call(this, opts.method);
            validateSchemaBodyOption.call(this, opts.method, path, opts.schema);
            isGetRoute = opts.method === 'GET';
            isHeadRoute = opts.method === 'HEAD';
        }
        const headOpts = shouldExposeHead && isGetRoute ? { ...options } : null;
        const prefix = this[symbols_1.kRoutePrefix];
        if (path === '/' && prefix.length > 0 && opts.method !== 'HEAD') {
            switch (opts.prefixTrailingSlash) {
                case 'slash':
                    addNewRoute.call(this, { path, isFastify });
                    break;
                case 'no-slash':
                    addNewRoute.call(this, { path: '', isFastify });
                    break;
                case 'both':
                default:
                    addNewRoute.call(this, { path: '', isFastify });
                    if (ignoreTrailingSlash !== true && (ignoreDuplicateSlashes !== true || !prefix.endsWith('/'))) {
                        addNewRoute.call(this, { path, prefixing: true, isFastify });
                    }
            }
        }
        else if (path[0] === '/' && prefix.endsWith('/')) {
            addNewRoute.call(this, { path: path.slice(1), isFastify });
        }
        else {
            addNewRoute.call(this, { path, isFastify });
        }
        return this;
        function addNewRoute({ path, prefixing = false, isFastify = false }) {
            const url = prefix + path;
            opts.url = url;
            opts.path = url;
            opts.routePath = path;
            opts.prefix = prefix;
            opts.logLevel = opts.logLevel || this[symbols_1.kLogLevel];
            if (this[symbols_1.kLogSerializers] || opts.logSerializers) {
                opts.logSerializers = Object.assign(Object.create(this[symbols_1.kLogSerializers]), opts.logSerializers);
            }
            if (opts.attachValidation == null) {
                opts.attachValidation = false;
            }
            if (prefixing === false) {
                for (const hook of this[symbols_1.kHooks].onRoute) {
                    hook.call(this, opts);
                }
            }
            for (const hook of hooks_1.lifecycleHooks) {
                if (opts && hook in opts) {
                    if (Array.isArray(opts[hook])) {
                        for (const func of opts[hook]) {
                            if (typeof func !== 'function') {
                                throw new errors_1.FST_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(func));
                            }
                            if (hook === 'onSend' || hook === 'preSerialization' || hook === 'onError' || hook === 'preParsing') {
                                if (func.constructor.name === 'AsyncFunction' && func.length === 4) {
                                    throw new errors_1.FST_ERR_HOOK_INVALID_ASYNC_HANDLER();
                                }
                            }
                            else if (hook === 'onRequestAbort') {
                                if (func.constructor.name === 'AsyncFunction' && func.length !== 1) {
                                    throw new errors_1.FST_ERR_HOOK_INVALID_ASYNC_HANDLER();
                                }
                            }
                            else {
                                if (func.constructor.name === 'AsyncFunction' && func.length === 3) {
                                    throw new errors_1.FST_ERR_HOOK_INVALID_ASYNC_HANDLER();
                                }
                            }
                        }
                    }
                    else if (opts[hook] !== undefined && typeof opts[hook] !== 'function') {
                        throw new errors_1.FST_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(opts[hook]));
                    }
                }
            }
            const constraints = opts.constraints || {};
            const config = {
                ...opts.config,
                url,
                method: opts.method
            };
            const context = new Context({
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
                replySerializer: this[symbols_1.kReplySerializerDefault],
                validatorCompiler: opts.validatorCompiler,
                serializerCompiler: opts.serializerCompiler,
                exposeHeadRoute: shouldExposeHead,
                prefixTrailingSlash: (opts.prefixTrailingSlash || 'both'),
                server: this,
                isFastify
            });
            const headHandler = router.findRoute('HEAD', opts.url, constraints);
            const hasHEADHandler = headHandler !== null;
            try {
                router.on(opts.method, opts.url, { constraints }, routeHandler, context);
            }
            catch (error) {
                if (!context[symbols_1.kRouteByFastify]) {
                    const isDuplicatedRoute = error.message.includes(`Method '${opts.method}' already declared for route`);
                    if (isDuplicatedRoute) {
                        throw new errors_1.FST_ERR_DUPLICATED_ROUTE(opts.method, opts.url);
                    }
                    throw error;
                }
            }
            this.after((notHandledErr, done) => {
                context.errorHandler = opts.errorHandler
                    ? error_handler_1.buildErrorHandler(this[symbols_1.kErrorHandler], opts.errorHandler)
                    : this[symbols_1.kErrorHandler];
                context._parserOptions.limit = opts.bodyLimit || null;
                context.logLevel = opts.logLevel;
                context.logSerializers = opts.logSerializers;
                context.attachValidation = opts.attachValidation;
                context[symbols_1.kReplySerializerDefault] = this[symbols_1.kReplySerializerDefault];
                context.schemaErrorFormatter =
                    opts.schemaErrorFormatter || this[symbols_1.kSchemaErrorFormatter] || context.schemaErrorFormatter;
                avvio.once('preReady', () => {
                    for (const hook of hooks_1.lifecycleHooks) {
                        const toSet = this[symbols_1.kHooks][hook]
                            .concat(opts[hook] || [])
                            .map((h) => h.bind(this));
                        context[hook] = toSet.length ? toSet : null;
                    }
                    while (!context.Request[symbols_1.kHasBeenDecorated] && context.Request.parent) {
                        context.Request = context.Request.parent;
                    }
                    while (!context.Reply[symbols_1.kHasBeenDecorated] && context.Reply.parent) {
                        context.Reply = context.Reply.parent;
                    }
                    fourOhFour.setContext(this, context);
                    if (opts.schema) {
                        context.schema = schemas_1.normalizeSchema(context.schema, this.initialConfig);
                        const schemaController = this[symbols_1.kSchemaController];
                        const hasValidationSchema = opts.schema.body ||
                            opts.schema.headers ||
                            opts.schema.querystring ||
                            opts.schema.params;
                        if (!opts.validatorCompiler && hasValidationSchema) {
                            schemaController.setupValidator(this[symbols_1.kOptions]);
                        }
                        try {
                            const isCustomValidation = typeof opts?.validatorCompiler === 'function' ||
                                schemaController.isCustomValidatorCompiler;
                            validation_1.compileSchemasForValidation(context, opts.validatorCompiler || schemaController.validatorCompiler, isCustomValidation);
                        }
                        catch (error) {
                            throw new errors_1.FST_ERR_SCH_VALIDATION_BUILD(opts.method, url, error.message);
                        }
                        if (opts.schema.response && !opts.serializerCompiler) {
                            schemaController.setupSerializer(this[symbols_1.kOptions]);
                        }
                        try {
                            validation_1.compileSchemasForSerialization(context, opts.serializerCompiler || schemaController.serializerCompiler);
                        }
                        catch (error) {
                            throw new errors_1.FST_ERR_SCH_SERIALIZATION_BUILD(opts.method, url, error.message);
                        }
                    }
                });
                done(notHandledErr);
            });
            if (shouldExposeHead && isGetRoute && !isHeadRoute && !hasHEADHandler) {
                const onSendHandlers = (0, head_route_1.parseHeadOnSendHandlers)(headOpts.onSend);
                prepareRoute.call(this, { method: 'HEAD', url: path, options: { ...headOpts, onSend: onSendHandlers }, isFastify: true });
            }
        }
    }
    function routeHandler(req, res, params, context, query) {
        const id = (0, req_id_gen_factory_1.getGenReqId)(context.server, req);
        const loggerOpts = {
            level: context.logLevel
        };
        if (context.logSerializers) {
            loggerOpts.serializers = context.logSerializers;
        }
        const childLogger = logger_factory_1.createChildLogger(context, logger, req, id, loggerOpts);
        childLogger[symbols_1.kDisableRequestLogging] = disableRequestLoggingFn ? false : disableRequestLogging;
        if (closing === true) {
            if (req.httpVersionMajor !== 2) {
                res.setHeader('Connection', 'close');
            }
            if (return503OnClosing) {
                const headers = {
                    'Content-Type': 'application/json',
                    'Content-Length': '80'
                };
                res.writeHead(503, headers);
                res.end('{"error":"Service Unavailable","message":"Service Unavailable","statusCode":503}');
                childLogger.info({ res: { statusCode: 503 } }, 'request aborted - refusing to accept new requests as server is closing');
                return;
            }
        }
        const connHeader = String.prototype.toLowerCase.call(req.headers.connection || '');
        if (connHeader === 'keep-alive') {
            if (keepAliveConnections.has(req.socket) === false) {
                keepAliveConnections.add(req.socket);
                req.socket.on('close', removeTrackedSocket.bind({ keepAliveConnections, socket: req.socket }));
            }
        }
        if (req.headers[symbols_1.kRequestAcceptVersion] !== undefined) {
            req.headers['accept-version'] = req.headers[symbols_1.kRequestAcceptVersion];
            req.headers[symbols_1.kRequestAcceptVersion] = undefined;
        }
        const request = new context.Request(id, params, req, query, childLogger, context);
        const reply = new context.Reply(res, request, childLogger);
        const resolvedDisableRequestLogging = disableRequestLoggingFn
            ? disableRequestLoggingFn(request)
            : disableRequestLogging;
        childLogger[symbols_1.kDisableRequestLogging] = resolvedDisableRequestLogging;
        if (resolvedDisableRequestLogging === false) {
            childLogger.info({ req: request }, 'incoming request');
        }
        if (hasLogger === true || context.onResponse !== null) {
            setupResponseListeners(reply);
        }
        if (context.onRequest !== null) {
            (0, hooks_1.onRequestHookRunner)(context.onRequest, request, reply, runPreParsing);
        }
        else {
            runPreParsing(null, request, reply);
        }
        if (context.onRequestAbort !== null) {
            req.on('close', () => {
                if (req.aborted) {
                    (0, hooks_1.onRequestAbortHookRunner)(context.onRequestAbort, request, handleOnRequestAbortHooksErrors.bind(null, reply));
                }
            });
        }
        if (context.onTimeout !== null) {
            if (!request.raw.socket._meta) {
                request.raw.socket.on('timeout', handleTimeout);
            }
            request.raw.socket._meta = { context, request, reply };
        }
    }
}
function handleOnRequestAbortHooksErrors(reply, err) {
    if (err) {
        reply.log.error({ err }, 'onRequestAborted hook failed');
    }
}
function handleTimeout() {
    const { context, request, reply } = this._meta;
    (0, hooks_1.onTimeoutHookRunner)(context.onTimeout, request, reply, noop);
}
function normalizeAndValidateMethod(method) {
    if (typeof method !== 'string') {
        throw new errors_1.FST_ERR_ROUTE_METHOD_INVALID();
    }
    method = method.toUpperCase();
    if (!this[symbols_1.kSupportedHTTPMethods].bodyless.has(method) &&
        !this[symbols_1.kSupportedHTTPMethods].bodywith.has(method)) {
        throw new errors_1.FST_ERR_ROUTE_METHOD_NOT_SUPPORTED(method);
    }
    return method;
}
function validateSchemaBodyOption(method, path, schema) {
    if (this[symbols_1.kSupportedHTTPMethods].bodyless.has(method) && schema?.body) {
        throw new errors_1.FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED(method, path);
    }
}
function validateBodyLimitOption(bodyLimit) {
    if (bodyLimit === undefined)
        return;
    if (!Number.isInteger(bodyLimit) || bodyLimit <= 0) {
        throw new errors_1.FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT(bodyLimit);
    }
}
function runPreParsing(err, request, reply) {
    if (reply.sent === true)
        return;
    if (err != null) {
        reply[symbols_1.kReplyIsError] = true;
        reply.send(err);
        return;
    }
    request[symbols_1.kRequestPayloadStream] = request.raw;
    if (request[symbols_1.kRouteContext].preParsing !== null) {
        hooks_1.preParsingHookRunner(request[symbols_1.kRouteContext].preParsing, request, reply, handleRequest.bind(request.server));
    }
    else {
        handleRequest.call(request.server, null, request, reply);
    }
}
function buildRouterOptions(options, defaultOptions) {
    const routerOptions = options.routerOptions == null
        ? Object.create(null)
        : Object.assign(Object.create(null), options.routerOptions);
    const usedDeprecatedOptions = routerKeys.filter(key => Object.hasOwn(options, key));
    if (usedDeprecatedOptions.length > 0) {
        (0, warnings_1.FSTDEP022)(usedDeprecatedOptions.join(', '));
    }
    for (const key of routerKeys) {
        if (!Object.hasOwn(routerOptions, key)) {
            routerOptions[key] = options[key] ?? defaultOptions[key];
        }
    }
    return routerOptions;
}
function removeTrackedSocket() {
    this.keepAliveConnections.delete(this.socket);
}
function noop() { }
module.exports = { buildRouting, validateBodyLimitOption, buildRouterOptions };
