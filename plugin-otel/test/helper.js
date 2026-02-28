'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

/**
 * Set up an in-memory OTel tracer provider for use in tests.
 * Call provider.shutdown() in t.after() to clean up.
 * @returns {{ exporter: InMemorySpanExporter, provider: NodeTracerProvider }}
 */
function setupOtel () {
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider()
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
  provider.register()
  return { exporter, provider }
}

module.exports = { setupOtel }
