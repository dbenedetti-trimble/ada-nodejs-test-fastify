'use strict'

const t = require('node:test')
const test = t.test
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

test('@covers_ACTC_4_1 - All test files use node:test via borp', async (t) => {
  t.plan(3)

  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

  t.assert.ok(packageJson.devDependencies.borp, 'borp must be listed in devDependencies')

  const testScript = packageJson.scripts.unit
  t.assert.strictEqual(testScript, 'borp', 'unit test script must use borp')

  const borpConfigPath = join(__dirname, '..', '.borp.yaml')
  const borpConfig = readFileSync(borpConfigPath, 'utf8')
  t.assert.ok(borpConfig.includes('test/**/*.test.js'), 'borp config must include test pattern')
})

test('@covers_ACTC_4_1 - Test files follow proper structure and import node:test', async (t) => {
  const testDir = __dirname
  const testFiles = []

  function collectTestFiles (dir) {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        collectTestFiles(fullPath)
      } else if (entry.endsWith('.test.js') || entry.endsWith('.test.mjs')) {
        testFiles.push(fullPath)
      }
    }
  }

  collectTestFiles(testDir)

  t.assert.ok(testFiles.length > 0, 'Test files must exist')

  let nodeTestImportCount = 0
  let testFilesChecked = 0

  for (const testFile of testFiles) {
    const content = readFileSync(testFile, 'utf8')

    if (content.includes("require('node:test')") ||
        content.includes('from \'node:test\'') ||
        content.includes('from "node:test"')) {
      nodeTestImportCount++
    }

    if (content.includes('const test = ') || content.includes('import { test }')) {
      testFilesChecked++
    }
  }

  t.assert.ok(nodeTestImportCount > 10, `Multiple test files must import node:test (found ${nodeTestImportCount})`)
  t.assert.ok(testFilesChecked > 10, `Multiple test files must define test (found ${testFilesChecked})`)
})

test('@covers_ACTC_4_2 - No Jest, Mocha, or other test runners in dependencies', async (t) => {
  t.plan(8)

  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

  const dependencies = packageJson.dependencies || {}
  const devDependencies = packageJson.devDependencies || {}
  const allDeps = { ...dependencies, ...devDependencies }

  t.assert.strictEqual(allDeps.jest, undefined, 'jest must not be in dependencies')
  t.assert.strictEqual(allDeps.mocha, undefined, 'mocha must not be in dependencies')
  t.assert.strictEqual(allDeps.jasmine, undefined, 'jasmine must not be in dependencies')
  t.assert.strictEqual(allDeps.ava, undefined, 'ava must not be in dependencies')
  t.assert.strictEqual(allDeps.tape, undefined, 'tape must not be in dependencies')
  t.assert.strictEqual(allDeps.tap, undefined, 'tap must not be in dependencies')

  t.assert.ok(allDeps.borp, 'borp must be present as the test runner')

  t.assert.ok(packageJson.scripts.unit === 'borp', 'unit test script must use borp')
})

test('@covers_ACTC_4_2 - No Jest or Mocha config files exist', async (t) => {
  const rootDir = join(__dirname, '..')
  const files = readdirSync(rootDir)

  const jestConfigFiles = files.filter(f =>
    f.includes('jest.config') ||
    f === '.jestrc' ||
    f === '.jestrc.json'
  )

  const mochaConfigFiles = files.filter(f =>
    f === '.mocharc.js' ||
    f === '.mocharc.json' ||
    f === '.mocharc.yaml' ||
    f === '.mocharc.yml' ||
    f === 'mocha.opts'
  )

  t.assert.strictEqual(jestConfigFiles.length, 0, 'No Jest config files should exist')
  t.assert.strictEqual(mochaConfigFiles.length, 0, 'No Mocha config files should exist')
})

test('@covers_ACTC_4_1 - Test runner uses native node:test assertions', async (t) => {
  const testDir = __dirname
  const testFiles = []

  function collectTestFiles (dir) {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        collectTestFiles(fullPath)
      } else if (entry.endsWith('.test.js') || entry.endsWith('.test.mjs')) {
        testFiles.push(fullPath)
      }
    }
  }

  collectTestFiles(testDir)

  let nativeAssertionCount = 0

  for (const testFile of testFiles) {
    const content = readFileSync(testFile, 'utf8')

    if (content.includes('t.assert.') ||
        content.includes('t.plan(') ||
        content.includes('t.mock.')) {
      nativeAssertionCount++
    }
  }

  t.assert.ok(nativeAssertionCount > 10, `Test files must use native node:test assertions (found ${nativeAssertionCount} files)`)
})

test('@covers_ACTC_4_1 - Coverage is configured via borp', async (t) => {
  t.plan(2)

  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

  const coverageScript = packageJson.scripts.coverage || packageJson.scripts['unit:report']
  t.assert.ok(coverageScript, 'Coverage script must be defined')

  t.assert.ok(
    coverageScript.includes('borp') || coverageScript.includes('c8'),
    'Coverage must use borp or c8 (which works with borp)'
  )
})

test('@covers_ACTC_4_1 @covers_ACTC_4_2 - Test infrastructure validation summary', async (t) => {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))

  const validations = {
    usesNodeTest: packageJson.scripts.unit === 'borp',
    hasBorp: !!packageJson.devDependencies.borp,
    noJest: !packageJson.dependencies?.jest && !packageJson.devDependencies?.jest,
    noMocha: !packageJson.dependencies?.mocha && !packageJson.devDependencies?.mocha,
    hasCoverageConfig: !!packageJson.scripts.coverage,
    hasTestTypeScript: !!packageJson.scripts['test:typescript']
  }

  t.assert.strictEqual(validations.usesNodeTest, true, 'Must use node:test via borp')
  t.assert.strictEqual(validations.hasBorp, true, 'Must have borp in devDependencies')
  t.assert.strictEqual(validations.noJest, true, 'Must not have Jest')
  t.assert.strictEqual(validations.noMocha, true, 'Must not have Mocha')
  t.assert.strictEqual(validations.hasCoverageConfig, true, 'Must have coverage configuration')
  t.assert.strictEqual(validations.hasTestTypeScript, true, 'Must have TypeScript test support')
})
