const { test } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

test('TypeScript compilation requirements - TASK-DB-TEST-8-TC-1', async (t) => {
  await t.test('@covers_ACTC_1_1 - Target is ES2022', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.strictEqual(
      tsconfig.compilerOptions.target,
      'ES2022',
      'TypeScript target must be ES2022 to match Node.js 20+ capabilities'
    )
  })

  await t.test('@covers_ACTC_1_2 - Strict mode is enabled', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.strictEqual(
      tsconfig.compilerOptions.strict,
      true,
      'TypeScript strict mode must be enabled'
    )
  })

  await t.test('@covers_ACTC_1_3 - Output configuration ensures functional identity', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.strictEqual(
      tsconfig.compilerOptions.module,
      'commonjs',
      'Module format must be CommonJS for compatibility'
    )

    assert.strictEqual(
      tsconfig.compilerOptions.esModuleInterop,
      true,
      'esModuleInterop ensures proper CommonJS interop'
    )

    assert.strictEqual(
      tsconfig.compilerOptions.moduleResolution,
      'node',
      'Node module resolution ensures correct require behavior'
    )
  })

  await t.test('@covers_ACTC_1_4 - No source maps are generated', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.strictEqual(
      tsconfig.compilerOptions.sourceMap,
      false,
      'Source maps must not be generated (Fastify does not ship source maps)'
    )
  })

  await t.test('TypeScript configuration file structure', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.ok(tsconfig.compilerOptions, 'compilerOptions must exist')
    assert.ok(tsconfig.include, 'include patterns must be defined')
    assert.ok(tsconfig.exclude, 'exclude patterns must be defined')

    assert.ok(
      tsconfig.include.includes('lib/**/*.ts'),
      'Must include lib/**/*.ts pattern'
    )

    assert.ok(
      tsconfig.exclude.includes('node_modules'),
      'Must exclude node_modules'
    )

    assert.ok(
      tsconfig.exclude.includes('test'),
      'Must exclude test directory'
    )
  })

  await t.test('Additional compiler options for correctness', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.strictEqual(
      tsconfig.compilerOptions.declaration,
      false,
      'Declaration files should not be generated (types/ are hand-maintained)'
    )

    assert.strictEqual(
      tsconfig.compilerOptions.allowJs,
      false,
      'Only TypeScript files should be processed'
    )

    assert.strictEqual(
      tsconfig.compilerOptions.skipLibCheck,
      true,
      'Skip lib checks for faster compilation'
    )

    assert.strictEqual(
      tsconfig.compilerOptions.noEmit,
      false,
      'Must emit compiled JavaScript files'
    )
  })
})

test('Module system constraints - TASK-DB-TEST-8-TC-2', async (t) => {
  await t.test('@covers_ACTC_2_1 - Must compile to CommonJS with require/module.exports', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.strictEqual(
      tsconfig.compilerOptions.module,
      'commonjs',
      'Module format must be CommonJS (not ESM)'
    )

    assert.strictEqual(
      tsconfig.compilerOptions.moduleResolution,
      'node',
      'Node module resolution required for CommonJS compatibility'
    )
  })

  await t.test('@covers_ACTC_2_2 - Cannot switch to ESM (out of scope per PRD)', () => {
    const tsconfigPath = join(__dirname, '..', 'tsconfig.json')
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))

    assert.notStrictEqual(
      tsconfig.compilerOptions.module,
      'es2015',
      'ESM module format is explicitly not supported'
    )

    assert.notStrictEqual(
      tsconfig.compilerOptions.module,
      'es2020',
      'ESM module format is explicitly not supported'
    )

    assert.notStrictEqual(
      tsconfig.compilerOptions.module,
      'esnext',
      'ESM module format is explicitly not supported'
    )
  })

  await t.test('@covers_ACTC_2_3 @integration_test - Compiled output uses CommonJS patterns', () => {
    const { readdirSync } = require('fs')
    const { join } = require('path')
    const libPath = join(__dirname, '..', 'lib')

    let foundJsFile = false
    const jsFiles = readdirSync(libPath).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))

    assert.ok(jsFiles.length > 0, 'At least one .js file should exist in lib/')

    for (const jsFile of jsFiles) {
      const filePath = join(libPath, jsFile)
      const content = readFileSync(filePath, 'utf8')

      if (content.includes('require(') || content.includes('module.exports')) {
        foundJsFile = true

        assert.ok(
          !content.includes('import ') || content.includes("'use strict'"),
          `${jsFile} should use CommonJS patterns (require/module.exports)`
        )

        assert.ok(
          !content.match(/\bexport\s+(default|const|function|class|let|var)\b/) || content.includes('module.exports'),
          `${jsFile} should not use ESM export syntax`
        )
      }
    }

    assert.ok(foundJsFile, 'Should find at least one CommonJS file in lib/ for validation')
  })
})
