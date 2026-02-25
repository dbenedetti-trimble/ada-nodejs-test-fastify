export class FST_ERR_INVALID_URL extends Error {
  constructor(type: string, ...args: any[]);
}

export class FST_ERR_ROUTE_OPTIONS_NOT_OBJ extends Error {
  constructor(method: string, url: string, ...args: any[]);
}

export class FST_ERR_ROUTE_DUPLICATED_HANDLER extends Error {
  constructor(method: string, url: string, ...args: any[]);
}

export class FST_ERR_ROUTE_HANDLER_NOT_FN extends Error {
  constructor(method: string, url: string, ...args: any[]);
}

export class FST_ERR_ROUTE_MISSING_HANDLER extends Error {
  constructor(method: string, url: string, ...args: any[]);
}

export class FST_ERR_ROUTE_METHOD_NOT_SUPPORTED extends Error {
  constructor(method: string, ...args: any[]);
}

export class FST_ERR_ROUTE_METHOD_INVALID extends Error {
  constructor(...args: any[]);
}

export class FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED extends Error {
  constructor(method: string, url: string, ...args: any[]);
}

export class FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT extends Error {
  constructor(limit: any, ...args: any[]);
}

export class FST_ERR_HOOK_INVALID_ASYNC_HANDLER extends Error {
  constructor(...args: any[]);
}

export class FST_ERR_DUPLICATED_ROUTE extends Error {
  constructor(method: string, url: string, ...args: any[]);
}

export class FST_ERR_HOOK_INVALID_HANDLER extends Error {
  constructor(hook: string, type: string, ...args: any[]);
}

export class FST_ERR_SCH_VALIDATION_BUILD extends Error {
  constructor(method: string, url: string, message: string, ...args: any[]);
}

export class FST_ERR_SCH_SERIALIZATION_BUILD extends Error {
  constructor(method: string, url: string, message: string, ...args: any[]);
}
