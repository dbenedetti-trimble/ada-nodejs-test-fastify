export declare const lifecycleHooks: string[]
export declare const applicationHooks: string[]
export declare const supportedHooks: string[]

export declare function onRequestAbortHookRunner(
  hooks: any[],
  request: any,
  cb: (...args: any[]) => any
): void

export declare function onRequestHookRunner(
  hooks: any[],
  request: any,
  reply: any,
  cb: (...args: any[]) => any
): void

export declare function preParsingHookRunner(
  hooks: any[],
  request: any,
  reply: any,
  cb: (...args: any[]) => any
): void

export declare function onTimeoutHookRunner(
  hooks: any[],
  request: any,
  reply: any,
  cb: (...args: any[]) => any
): void

export declare function preValidationHookRunner(
  hooks: any[],
  request: any,
  reply: any,
  cb: (...args: any[]) => any
): void

export declare function preHandlerHookRunner(
  hooks: any[],
  request: any,
  reply: any,
  cb: (...args: any[]) => any
): void
