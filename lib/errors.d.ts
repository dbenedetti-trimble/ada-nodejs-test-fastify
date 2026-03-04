interface FastifyErrorConstructor {
  new (...args: any[]): Error;
  (...args: any[]): Error;
}

export declare const FST_ERR_SCH_VALIDATION_BUILD: FastifyErrorConstructor;
export declare const FST_ERR_SCH_SERIALIZATION_BUILD: FastifyErrorConstructor;
export declare const FST_ERR_DUPLICATED_ROUTE: FastifyErrorConstructor;
export declare const FST_ERR_INVALID_URL: FastifyErrorConstructor;
export declare const FST_ERR_HOOK_INVALID_HANDLER: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_OPTIONS_NOT_OBJ: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_DUPLICATED_HANDLER: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_HANDLER_NOT_FN: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_MISSING_HANDLER: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_METHOD_NOT_SUPPORTED: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_METHOD_INVALID: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED: FastifyErrorConstructor;
export declare const FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT: FastifyErrorConstructor;
export declare const FST_ERR_HOOK_INVALID_ASYNC_HANDLER: FastifyErrorConstructor;
