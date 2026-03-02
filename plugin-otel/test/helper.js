'use strict'

const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const api = require('@opentelemetry/api')

function setupOtel () {
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()

  return { exporter, provider }
}

function teardownOtel (provider) {
  api.trace.disable()
  return provider.shutdown()
}

async function getSpans (exporter, provider) {
  await provider.forceFlush()
  return exporter.getFinishedSpans()
}

function resetSpans (exporter) {
  exporter.reset()
}

module.exports = { setupOtel, teardownOtel, getSpans, resetSpans }
