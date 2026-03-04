import FindMyWay = require('find-my-way');
import Context = require('./context');
import handleRequest = require('./handle-request');
import { onRequestAbortHookRunner, lifecycleHooks, preParsingHookRunner, onTimeoutHookRunner, onRequestHookRunner } from './hooks';
import { normalizeSchema } from './schemas';
import { parseHeadOnSendHandlers } from './head-route';
import {
  compileSchemasForValidation,
  compileSchemasForSerialization
} from './validation';
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
} from './errors';
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
} from './symbols';
import { buildErrorHandler } from './error-handler';
import { createChildLogger } from './logger-factory';
import { getGenReqId } from './req-id-gen-factory';
import { FSTDEP022 } from './warnings';

interface RoutingApi {
  setup: (options: any, fastifyArgs: any) => void;
  routing: (...args: any[]) => any;
  route: (this: any, opts: { options: any; isFastify: boolean }) => any;
  hasRoute: (opts: { options: any }) => boolean;
  prepareRoute: (this: any, opts: PrepareRouteArgs) => any;
  routeHandler: (req: any, res: any, params: any, context: any, query: any) => void;
  closeRoutes: () => void;
  printRoutes: (...args: any[]) => string;
  addConstraintStrategy: (strategy: any) => void;
  hasConstraintStrategy: (strategyName: string) => boolean;
  isAsyncConstraint: () => boolean;
  findRoute: (options: any) => any;
}

interface PrepareRouteArgs {
  method: string;
  url: string;
  options: any;
  handler?: Function;
  isFastify: boolean;
}

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
];

function buildRouting(options: any): RoutingApi {
  // TODO: implement in features pass — full closure-based factory with router setup,
  // route registration, request handling, and all internal helper functions.
  throw new Error('Not implemented: buildRouting');
}

function validateBodyLimitOption(bodyLimit: any): void {
  // TODO: implement in features pass — validate that bodyLimit is a positive integer.
  throw new Error('Not implemented: validateBodyLimitOption');
}

function buildRouterOptions(options: any, defaultOptions: any): any {
  // TODO: implement in features pass — merge router options with defaults and emit deprecation warnings.
  throw new Error('Not implemented: buildRouterOptions');
}

export = { buildRouting, validateBodyLimitOption, buildRouterOptions };
