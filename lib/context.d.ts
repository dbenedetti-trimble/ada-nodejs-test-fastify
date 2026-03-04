declare function Context(opts: {
  schema: any;
  handler: Function;
  config: any;
  errorHandler: any;
  childLoggerFactory: any;
  bodyLimit: any;
  logLevel: any;
  logSerializers: any;
  attachValidation: any;
  validatorCompiler: any;
  serializerCompiler: any;
  replySerializer: any;
  schemaErrorFormatter: any;
  exposeHeadRoute: any;
  prefixTrailingSlash: string;
  server: any;
  isFastify: boolean;
}): any;

export = Context;
