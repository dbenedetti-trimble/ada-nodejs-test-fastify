declare class Context {
  constructor(opts: {
    schema: any
    handler: (...args: any[]) => any
    config: any
    requestIdLogLabel?: string
    childLoggerFactory?: any
    errorHandler?: any
    bodyLimit?: number
    logLevel?: string
    logSerializers?: any
    attachValidation?: boolean
    schemaErrorFormatter?: any
    replySerializer?: any
    validatorCompiler?: any
    serializerCompiler?: any
    exposeHeadRoute?: boolean
    prefixTrailingSlash?: string
    server: any
    isFastify?: boolean
  })
  [key: string]: any
}

export = Context
