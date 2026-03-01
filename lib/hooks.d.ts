export declare const lifecycleHooks: string[];
export declare function onRequestHookRunner (fns: any[], request: any, reply: any, next: any): void;
export declare function preParsingHookRunner (fns: any[], request: any, reply: any, next: any): void;
export declare function onRequestAbortHookRunner (fns: any[], request: any, cb: any): void;
export declare function onTimeoutHookRunner (fns: any[], request: any, reply: any, next: any): void;
