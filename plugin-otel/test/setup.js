'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { W3CTraceContextPropagator } = require('@opentelemetry/core')
const { trace, propagation } = require('@opentelemetry/api')

function setupOtel () {
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  return { exporter, provider }
}

async function teardownOtel ({ provider, exporter }) {
  exporter.reset()
  await provider.shutdown()
  trace.disable()
}

function getSpans (exporter) {
  return exporter.getFinishedSpans()
}

module.exports = { setupOtel, teardownOtel, getSpans }
