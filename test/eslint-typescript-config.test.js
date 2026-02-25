const { test } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

test('ESLint configuration update - TASK-DB-TEST-8-FR-5', async (t) => {
  await t.test('@covers_ACFR_5_1 - ESLint configuration contains TypeScript support', () => {
    const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
    const configContent = readFileSync(eslintConfigPath, 'utf8')

    assert.ok(
      configContent.includes('ts: true'),
      'ESLint configuration must enable TypeScript support with ts: true'
    )
  })

  await t.test('@covers_ACFR_5_2 - ESLint configuration has proper ignore patterns for build artifacts', () => {
    const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
    const configContent = readFileSync(eslintConfigPath, 'utf8')

    assert.ok(
      configContent.includes('.ada/**') || configContent.includes('.ada/'),
      'ESLint configuration should ignore .ada directory'
    )

    assert.ok(
      configContent.includes('build/**') || configContent.includes('build/'),
      'ESLint configuration should ignore build directory'
    )
  })

  await t.test('@covers_ACFR_5_3 - ESLint configuration maintains neostandard base', () => {
    const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
    const configContent = readFileSync(eslintConfigPath, 'utf8')

    assert.ok(
      configContent.includes('neostandard'),
      'ESLint configuration must continue using neostandard base'
    )

    assert.ok(
      configContent.includes("'comma-dangle'"),
      'ESLint configuration must preserve existing custom rules like comma-dangle'
    )

    assert.ok(
      configContent.includes("'max-len'"),
      'ESLint configuration must preserve existing custom rules like max-len'
    )
  })

  await t.test('ESLint configuration has proper structure', () => {
    const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')

    let eslintConfig
    try {
      eslintConfig = require(eslintConfigPath)
    } catch (error) {
      assert.fail(`ESLint config should be valid JavaScript: ${error.message}`)
    }

    assert.ok(Array.isArray(eslintConfig), 'ESLint config should export an array')
    assert.ok(eslintConfig.length > 0, 'ESLint config should have at least one configuration object')
  })

  await t.test('TypeScript files in lib/ will be linted (configuration check)', () => {
    const eslintConfigPath = join(__dirname, '..', 'eslint.config.js')
    const configContent = readFileSync(eslintConfigPath, 'utf8')

    const hasLibIgnore = configContent.match(/'lib\/\*\*'/g) ||
                          configContent.match(/"lib\/\*\*"/g) ||
                          configContent.match(/lib\/\*\*/g)

    assert.ok(
      !hasLibIgnore || hasLibIgnore.length === 0,
      'lib/ directory should NOT be ignored by ESLint to allow TypeScript linting'
    )
  })
})
