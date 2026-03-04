export declare const lifecycleHooks: string[];
export declare function onRequestAbortHookRunner(hooks: any[], request: any, cb: Function): void;
export declare function preParsingHookRunner(hooks: any[], request: any, reply: any, cb: Function): void;
export declare function onTimeoutHookRunner(hooks: any[], request: any, reply: any, cb: Function): void;
export declare function onRequestHookRunner(hooks: any[], request: any, reply: any, cb: Function): void;
