'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
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
  provider.shutdown()
}

function getSpans (exporter) {
  return exporter.getFinishedSpans()
}

function findSpan (spans, name) {
  return spans.find(s => s.name === name)
}

function findSpans (spans, name) {
  return spans.filter(s => s.name === name)
}

module.exports = { setupOtel, teardownOtel, getSpans, findSpan, findSpans }
