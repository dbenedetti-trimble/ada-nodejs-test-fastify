const { test } = require('node:test')
const assert = require('node:assert')
const { execSync } = require('node:child_process')
const { readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Find all TypeScript files in a directory recursively
 */
function findTsFiles (dir) {
  const results = []
  try {
    const files = readdirSync(dir)
    for (const file of files) {
      const filePath = join(dir, file)
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        results.push(...findTsFiles(filePath))
      } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
        results.push(filePath)
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  return results
}

test('TypeScript compilation performance - TASK-DB-TEST-8-NFR-1', async (t) => {
  await t.test('@covers_ACNFR_1_1 @performance_test - Compiling a single .ts file should take under 2 seconds', () => {
    const libPath = join(__dirname, '..', 'lib')
    const tsFiles = findTsFiles(libPath)

    if (tsFiles.length === 0) {
      t.skip('No TypeScript files found in lib/ directory - skipping compilation performance test')
      return
    }

    // Measure compilation time for a single file
    // We'll measure the full `tsc` command which compiles all .ts files in lib/
    const startTime = Date.now()

    try {
      execSync('npx tsc --noEmit', {
        cwd: join(__dirname, '..'),
        stdio: 'pipe',
        timeout: 5000 // 5 second timeout as safety net
      })
    } catch (error) {
      // If compilation fails, that's a different test concern
      // This test is only about performance IF compilation succeeds
      assert.fail(`TypeScript compilation failed: ${error.message}`)
    }

    const endTime = Date.now()
    const compilationTimeMs = endTime - startTime
    const compilationTimeSec = compilationTimeMs / 1000

    // Log the actual time for visibility
    console.log(`TypeScript compilation completed in ${compilationTimeSec.toFixed(3)} seconds`)

    // Assert compilation time is under 2 seconds
    assert.ok(
      compilationTimeSec < 2.0,
      `TypeScript compilation took ${compilationTimeSec.toFixed(3)}s, which exceeds the 2.0s threshold`
    )
  })

  await t.test('Build script execution time is reasonable', () => {
    const libPath = join(__dirname, '..', 'lib')
    const tsFiles = findTsFiles(libPath)

    if (tsFiles.length === 0) {
      t.skip('No TypeScript files found in lib/ directory - skipping build script performance test')
      return
    }

    // Measure the build:ts npm script which is used in pretest
    const startTime = Date.now()

    try {
      execSync('npm run build:ts', {
        cwd: join(__dirname, '..'),
        stdio: 'pipe',
        timeout: 5000
      })
    } catch (error) {
      assert.fail(`Build script failed: ${error.message}`)
    }

    const endTime = Date.now()
    const buildTimeMs = endTime - startTime
    const buildTimeSec = buildTimeMs / 1000

    console.log(`Build script completed in ${buildTimeSec.toFixed(3)} seconds`)

    // Build script should also be fast (allowing slightly more time for script overhead)
    assert.ok(
      buildTimeSec < 3.0,
      `Build script took ${buildTimeSec.toFixed(3)}s, which may slow down the test cycle`
    )
  })

  await t.test('Compilation performance is consistent across multiple runs', async () => {
    const libPath = join(__dirname, '..', 'lib')
    const tsFiles = findTsFiles(libPath)

    if (tsFiles.length === 0) {
      t.skip('No TypeScript files found in lib/ directory - skipping consistency test')
      return
    }

    const runs = 3
    const times = []

    for (let i = 0; i < runs; i++) {
      const startTime = Date.now()

      try {
        execSync('npx tsc --noEmit', {
          cwd: join(__dirname, '..'),
          stdio: 'pipe',
          timeout: 5000
        })
      } catch (error) {
        assert.fail(`TypeScript compilation failed on run ${i + 1}: ${error.message}`)
      }

      const endTime = Date.now()
      times.push((endTime - startTime) / 1000)
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length
    const maxTime = Math.max(...times)
    const minTime = Math.min(...times)

    console.log(`Compilation times across ${runs} runs: min=${minTime.toFixed(3)}s, max=${maxTime.toFixed(3)}s, avg=${avgTime.toFixed(3)}s`)

    // Average should still be under 2 seconds
    assert.ok(
      avgTime < 2.0,
      `Average compilation time ${avgTime.toFixed(3)}s exceeds 2.0s threshold`
    )

    // Max time shouldn't be drastically higher than average (check for outliers)
    const variance = maxTime - minTime
    assert.ok(
      variance < 1.0,
      `Compilation time variance ${variance.toFixed(3)}s is too high, indicating inconsistent performance`
    )
  })
})
