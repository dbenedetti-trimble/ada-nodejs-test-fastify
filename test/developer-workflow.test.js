'use strict'

const { test } = require('node:test')
const { exec } = require('node:child_process')
const { promisify } = require('node:util')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const execAsync = promisify(exec)

test('@covers_ACNFR_4_1 - npm test remains single command (pretest handles build automatically)', async (t) => {
  const packageJsonPath = join(__dirname, '..', 'package.json')
  t.assert.ok(existsSync(packageJsonPath), 'package.json exists')

  const packageJson = require(packageJsonPath)
  
  t.assert.ok(packageJson.scripts.test, 'npm test script exists')
  t.assert.ok(packageJson.scripts.pretest, 'pretest hook exists')
  t.assert.strictEqual(
    packageJson.scripts.pretest,
    'npm run build:ts',
    'pretest runs build:ts automatically'
  )
  
  t.assert.ok(
    packageJson.scripts.test.includes('unit'),
    'npm test includes unit tests'
  )
})

test('@covers_ACNFR_4_2 - npm run unit works after build has run at least once', async (t) => {
  const packageJsonPath = join(__dirname, '..', 'package.json')
  const packageJson = require(packageJsonPath)
  
  t.assert.ok(packageJson.scripts.unit, 'npm run unit script exists')
  t.assert.strictEqual(packageJson.scripts.unit, 'borp', 'unit script runs borp directly')
  
  const typescriptBuildPath = join(__dirname, '..', 'fastify.d.ts')
  t.assert.ok(
    existsSync(typescriptBuildPath),
    'TypeScript build artifacts exist (build has run at least once)'
  )
})

test('@covers_ACNFR_4_3 - Fresh git clone workflow verification', async (t) => {
  const packageJsonPath = join(__dirname, '..', 'package.json')
  const packageJson = require(packageJsonPath)
  
  t.assert.ok(packageJson.scripts.pretest, 'pretest hook ensures build runs before test')
  t.assert.ok(packageJson.scripts['build:ts'], 'build:ts script exists for TypeScript compilation')
  
  t.assert.strictEqual(
    packageJson.scripts.pretest,
    'npm run build:ts',
    'pretest automatically triggers build on fresh clone'
  )
  
  t.assert.ok(
    packageJson.scripts.test.includes('lint') &&
    packageJson.scripts.test.includes('unit') &&
    packageJson.scripts.test.includes('test:typescript'),
    'test script includes all necessary checks'
  )
})

test('@integration_test - Verify complete developer workflow configuration', async (t) => {
  const packageJsonPath = join(__dirname, '..', 'package.json')
  const packageJson = require(packageJsonPath)
  
  const requiredScripts = [
    'test',
    'pretest',
    'unit',
    'build:ts',
    'test:typescript',
    'lint'
  ]
  
  for (const script of requiredScripts) {
    t.assert.ok(
      packageJson.scripts[script],
      `Required script '${script}' exists`
    )
  }
  
  const buildArtifacts = [
    join(__dirname, '..', 'fastify.d.ts'),
    join(__dirname, '..', 'package.json')
  ]
  
  for (const artifact of buildArtifacts) {
    t.assert.ok(
      existsSync(artifact),
      `Required artifact exists: ${artifact}`
    )
  }
})
