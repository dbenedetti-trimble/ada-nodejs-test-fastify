declare class Context {
  constructor(
    schema: any,
    handler: Function,
    reply: any,
    config: any,
    errorHandler: any,
    bodyLimit: number,
    logLevel: string,
    logSerializers: any,
    attachValidation: boolean,
    validatorCompiler: any,
    serializerCompiler: any,
    replySerializer: any,
    schemaErrorFormatter: any,
    exposeHeadRoute: boolean,
    prefixTrailingSlash: string,
    server: any,
    isFastify: boolean
  );
}

export = Context;
