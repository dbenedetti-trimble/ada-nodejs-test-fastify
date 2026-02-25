declare class Context {
  constructor(options: {
    schema: any;
    handler: Function;
    config: any;
    requestIdLogLabel?: string;
    childLoggerFactory?: any;
    errorHandler?: any;
    bodyLimit?: number;
    logLevel?: string;
    logSerializers?: any;
    attachValidation?: boolean;
    validatorCompiler?: any;
    serializerCompiler?: any;
    replySerializer?: any;
    schemaErrorFormatter?: any;
    exposeHeadRoute?: boolean;
    prefixTrailingSlash?: string;
    server: any;
    isFastify?: boolean;
  });
}

export = Context;
