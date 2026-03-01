'use strict'

const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter
} = require('@opentelemetry/sdk-trace-node')
const Fastify = require('../../..')
const otelPlugin = require('../..')

/**
 * Creates a test setup with an in-memory span exporter and a configured TracerProvider.
 * Call once per test file. Each test should call buildFastify() to get a fresh Fastify instance
 * and use exporter.reset() to clear spans between tests.
 *
 * @returns {{ exporter: InMemorySpanExporter, provider: NodeTracerProvider, buildFastify: Function, teardown: Function }}
 */
function createTestSetup () {
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()

  function buildFastify (pluginOpts) {
    exporter.reset()
    const fastify = Fastify({ logger: false })
    fastify.register(otelPlugin, pluginOpts)
    return fastify
  }

  async function teardown () {
    await provider.shutdown()
  }

  return { exporter, provider, buildFastify, teardown }
}

module.exports = { createTestSetup }
