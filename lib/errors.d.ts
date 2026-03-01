export declare class FST_ERR_SCH_VALIDATION_BUILD extends Error {
  constructor(method: string, url: string, message: string)
}
export declare class FST_ERR_SCH_SERIALIZATION_BUILD extends Error {
  constructor(method: string, url: string, message: string)
}
export declare class FST_ERR_DUPLICATED_ROUTE extends Error {
  constructor(method: string, url: string)
}
export declare class FST_ERR_INVALID_URL extends Error {
  constructor(type: string)
}
export declare class FST_ERR_HOOK_INVALID_HANDLER extends Error {
  constructor(hook: string, received: string)
}
export declare class FST_ERR_ROUTE_OPTIONS_NOT_OBJ extends Error {
  constructor(method: string, url: string)
}
export declare class FST_ERR_ROUTE_DUPLICATED_HANDLER extends Error {
  constructor(method: string, url: string)
}
export declare class FST_ERR_ROUTE_HANDLER_NOT_FN extends Error {
  constructor(method: string, url: string)
}
export declare class FST_ERR_ROUTE_MISSING_HANDLER extends Error {
  constructor(method: string | string[], url: string)
}
export declare class FST_ERR_ROUTE_METHOD_NOT_SUPPORTED extends Error {
  constructor(method: string)
}
export declare class FST_ERR_ROUTE_METHOD_INVALID extends Error {
  constructor()
}
export declare class FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED extends Error {
  constructor(method: string, url: string)
}
export declare class FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT extends Error {
  constructor(bodyLimit: any)
}
export declare class FST_ERR_HOOK_INVALID_ASYNC_HANDLER extends Error {
  constructor()
}
