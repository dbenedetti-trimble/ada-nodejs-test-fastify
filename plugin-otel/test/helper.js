'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

let _provider = null
let _exporter = null

function setupOtel () {
  if (!_provider) {
    _exporter = new InMemorySpanExporter()
    _provider = new NodeTracerProvider()
    _provider.addSpanProcessor(new SimpleSpanProcessor(_exporter))
    _provider.register()
  } else {
    _exporter.reset()
  }
  return { exporter: _exporter, provider: _provider }
}

module.exports = { setupOtel }
