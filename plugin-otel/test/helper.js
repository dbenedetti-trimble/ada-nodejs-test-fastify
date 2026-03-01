'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

let sharedExporter = null
let sharedProvider = null

function setupOtel () {
  if (!sharedProvider) {
    sharedExporter = new InMemorySpanExporter()
    sharedProvider = new NodeTracerProvider()
    sharedProvider.addSpanProcessor(new SimpleSpanProcessor(sharedExporter))
    sharedProvider.register()
  } else {
    sharedExporter.reset()
  }
  return { exporter: sharedExporter, provider: sharedProvider }
}

function shutdownOtel () {
  if (sharedProvider) {
    const p = sharedProvider
    sharedProvider = null
    sharedExporter = null
    return p.shutdown()
  }
  return Promise.resolve()
}

module.exports = { setupOtel, shutdownOtel }
