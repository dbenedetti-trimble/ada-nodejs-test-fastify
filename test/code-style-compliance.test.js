/**
 * Code Style Compliance Test
 *
 * @covers_ACTC_2_1 ESLint config: neostandard with custom rules
 * @covers_ACTC_2_2 Max line length: 120 characters (with exceptions)
 * @covers_ACTC_2_3 Comma dangle: 'never' (no trailing commas)
 * @covers_ACTC_2_4 Strict mode: All files must start with 'use strict'
 * @covers_ACTC_2_5 Internal symbols follow kCamelCase pattern
 * @covers_ACTC_3_1 Use Fastify's logger via fastify.log.debug()
 * @covers_ACTC_3_2 Do not add console.log statements
 * @lint_test
 *
 * Test Quality Principles:
 * - Verify ESLint configuration uses neostandard
 * - Validate code style rules are enforced
 * - Ensure proper logging practices
 * - Check symbol naming conventions
 *
 * Execution: npm test
 */

'use strict'

const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

/**
 * ACTC-2-1: ESLint config uses neostandard with custom rules
 */
test('ESLint configuration uses neostandard', t => {
  t.plan(4)

  const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
  const configContent = readFileSync(eslintConfigPath, 'utf8')

  t.assert.ok(configContent.includes("require('neostandard')"), 'ESLint config requires neostandard')
  t.assert.ok(configContent.includes("'comma-dangle'"), 'Config includes comma-dangle rule')
  t.assert.ok(configContent.includes("'max-len'"), 'Config includes max-len rule')
  t.assert.ok(configContent.includes('code: 120'), 'Max line length is set to 120')
})

/**
 * ACTC-2-2: Max line length is 120 characters with proper exceptions
 */
test('ESLint max-len rule configured correctly', t => {
  t.plan(5)

  const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
  const configContent = readFileSync(eslintConfigPath, 'utf8')

  t.assert.ok(configContent.includes('code: 120'), 'Max line length is 120')
  t.assert.ok(configContent.includes('ignoreUrls: true'), 'URLs are exempt from max-len')
  t.assert.ok(configContent.includes('ignoreStrings: true'), 'Strings are exempt from max-len')
  t.assert.ok(configContent.includes('ignoreTemplateLiterals: true'), 'Template literals are exempt')
  t.assert.ok(configContent.includes('ignoreComments: true'), 'Comments are exempt from max-len')
})

/**
 * ACTC-2-3: Comma dangle rule is set to 'never'
 */
test('ESLint comma-dangle rule set to never', t => {
  t.plan(1)

  const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
  const configContent = readFileSync(eslintConfigPath, 'utf8')

  t.assert.ok(configContent.includes("'comma-dangle': ['error', 'never']"), 'Comma dangle is set to never')
})

/**
 * ACTC-2-4: All plugin files start with 'use strict'
 */
test('Main plugin file starts with use strict', t => {
  t.plan(1)

  const indexPath = join(__dirname, '..', 'index.js')
  const content = readFileSync(indexPath, 'utf8')

  const firstLine = content.split('\n')[0]
  t.assert.strictEqual(firstLine, "'use strict'", 'index.js starts with use strict')
})

test('Lib files start with use strict', t => {
  t.plan(3)

  const otelApiPath = join(__dirname, '..', 'lib', 'otel-api.js')
  const spanAttributesPath = join(__dirname, '..', 'lib', 'span-attributes.js')
  const contextPropPath = join(__dirname, '..', 'lib', 'context-propagation.js')

  const otelApiContent = readFileSync(otelApiPath, 'utf8')
  const spanAttrsContent = readFileSync(spanAttributesPath, 'utf8')
  const contextPropContent = readFileSync(contextPropPath, 'utf8')

  t.assert.strictEqual(otelApiContent.split('\n')[0], "'use strict'", 'otel-api.js starts with use strict')
  t.assert.strictEqual(spanAttrsContent.split('\n')[0], "'use strict'", 'span-attributes.js starts with use strict')
  t.assert.strictEqual(contextPropContent.split('\n')[0], "'use strict'", 'context-propagation.js starts with use strict')
})

/**
 * ACTC-2-5: Internal symbols follow kCamelCase pattern
 */
test('Internal symbols use kCamelCase naming convention', t => {
  t.plan(3)

  const indexPath = join(__dirname, '..', 'index.js')
  const content = readFileSync(indexPath, 'utf8')

  t.assert.ok(content.includes('kOtelSpan'), 'kOtelSpan symbol exists')
  t.assert.ok(content.includes('kOtelHandlerSpan'), 'kOtelHandlerSpan symbol exists')
  t.assert.ok(content.includes('kOtelHookSpans'), 'kOtelHookSpans symbol exists')
})

/**
 * ACTC-3-1: Plugin uses fastify.log.debug() for debug messages
 */
test('Plugin uses fastify.log.debug for debug messages', t => {
  t.plan(1)

  const indexPath = join(__dirname, '..', 'index.js')
  const content = readFileSync(indexPath, 'utf8')

  t.assert.ok(content.includes('fastify.log.debug'), 'Uses fastify.log.debug for logging')
})

/**
 * ACTC-3-2: Plugin code does not contain console.log statements
 */
test('Plugin files do not contain console.log statements', t => {
  t.plan(4)

  const indexPath = join(__dirname, '..', 'index.js')
  const otelApiPath = join(__dirname, '..', 'lib', 'otel-api.js')
  const spanAttributesPath = join(__dirname, '..', 'lib', 'span-attributes.js')
  const contextPropPath = join(__dirname, '..', 'lib', 'context-propagation.js')

  const indexContent = readFileSync(indexPath, 'utf8')
  const otelApiContent = readFileSync(otelApiPath, 'utf8')
  const spanAttrsContent = readFileSync(spanAttributesPath, 'utf8')
  const contextPropContent = readFileSync(contextPropPath, 'utf8')

  t.assert.ok(!indexContent.includes('console.log'), 'index.js does not use console.log')
  t.assert.ok(!otelApiContent.includes('console.log'), 'otel-api.js does not use console.log')
  t.assert.ok(!spanAttrsContent.includes('console.log'), 'span-attributes.js does not use console.log')
  t.assert.ok(!contextPropContent.includes('console.log'), 'context-propagation.js does not use console.log')
})

/**
 * Integration test: Verify ESLint passes on plugin files
 */
test('ESLint passes on all plugin files', { skip: 'Run via npm run lint' }, t => {
  t.plan(1)
  t.assert.ok(true, 'This is tested by running: npm run lint')
})
