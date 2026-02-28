'use strict'

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

// OTel's ProxyTracerProvider only allows its delegate to be set once per process.
// We share a single provider per file (each file runs in its own borp worker process)
// and reset the exporter between tests for isolation.
let _sharedExporter = null
let _sharedProvider = null

function getSharedSetup () {
  if (_sharedProvider) return
  _sharedExporter = new InMemorySpanExporter()
  _sharedProvider = new NodeTracerProvider()
  _sharedProvider.addSpanProcessor(new SimpleSpanProcessor(_sharedExporter))
  _sharedProvider.register()
}

/**
 * Set up an in-memory OTel tracer provider for use in tests.
 * The provider is a per-file singleton; the exporter is reset on each call.
 * Call provider.shutdown() in t.after() to reset spans after the test.
 * @returns {{ exporter: InMemorySpanExporter, provider: { shutdown: () => Promise<void> } }}
 */
function setupOtel () {
  getSharedSetup()
  _sharedExporter.reset()
  return {
    exporter: _sharedExporter,
    provider: {
      shutdown: () => { _sharedExporter.reset(); return Promise.resolve() }
    }
  }
}

module.exports = { setupOtel }
