declare function Context(opts: {
  schema: any
  handler: Function
  config: any
  requestIdLogLabel?: string
  childLoggerFactory?: any
  errorHandler: any
  bodyLimit: any
  logLevel: any
  logSerializers: any
  attachValidation: any
  validatorCompiler: any
  serializerCompiler: any
  replySerializer: any
  schemaErrorFormatter: any
  exposeHeadRoute: boolean
  prefixTrailingSlash: string
  server: any
  isFastify: boolean
}): void

export = Context
