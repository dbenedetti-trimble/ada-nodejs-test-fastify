interface ContextOpts {
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
}

interface Context {
  schema: any;
  handler: Function;
  config: any;
  errorHandler: any;
  _parserOptions: any;
  logLevel: any;
  logSerializers: any;
  attachValidation: any;
  schemaErrorFormatter: any;
  server: any;
  Request: any;
  Reply: any;
  [key: string]: any;
}

interface ContextConstructor {
  new (opts: ContextOpts): Context;
  (opts: ContextOpts): any;
}

declare const Context: ContextConstructor;
export = Context;
