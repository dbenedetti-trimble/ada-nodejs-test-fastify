# Fastify Test Execution Guide

## Running Tests

### Run All Tests (Recommended)
```bash
npm test
# Runs: lint + unit tests + TypeScript type tests
```

### Unit Tests Only
```bash
npm run unit                      # Run unit tests with borp
borp                              # Direct borp invocation
```

### Watch Mode (Development)
```bash
npm run test:watch                # Run tests in watch mode
# Watches for file changes and re-runs tests
# Coverage reporting disabled for performance
# Uses terse reporter for minimal output
```

### TypeScript Type Tests
```bash
npm run test:typescript           # Validate TypeScript definitions
# Compiles test/types/import.ts without emitting
# Runs tsd for type-level testing
```

### Specific Test File
```bash
borp test/404s.test.js            # Run single test file
borp test/hooks/*.test.js         # Run tests matching pattern
```

### CI Test Mode
```bash
npm run test:ci                   # CI-specific test configuration
# Skips linting, runs unit + TypeScript tests only
```

## Test Data

### Test Data Location
- Test files often include inline test data
- Helper functions: `test/helper.js`
- Certificates: `test/build-certificate.js`
- No dedicated test fixtures directory

### Test Data Setup

#### Inline Test Data (Recommended Pattern)
```javascript
test('example test', async t => {
  const fastify = Fastify()
  
  // Setup: Define routes and data
  fastify.get('/user/:id', async (request, reply) => {
    return { id: request.params.id, name: 'John' }
  })
  
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())
  
  // Execute test with data
  const response = await fetch(`${getServerUrl(fastify)}/user/123`)
  const data = await response.json()
  
  // Assert
  t.assert.strictEqual(data.id, '123')
})
```

#### Shared Test Helpers
```javascript
// Import shared utilities
const { getServerUrl } = require('./helper')
const Fastify = require('..')

test('using helper', async t => {
  const fastify = Fastify()
  // ... use getServerUrl(fastify) to get server URL
})
```

### Test Data Cleanup

#### Automatic Cleanup with `t.after()`
```javascript
test('cleanup example', async t => {
  const fastify = Fastify()
  
  // Register cleanup handler
  t.after(() => { fastify.close() })
  
  // Test execution...
})
```

#### Manual Cleanup (if needed)
```javascript
test('manual cleanup', async t => {
  const resource = createResource()
  
  try {
    // Test logic
  } finally {
    await resource.cleanup()
  }
})
```

### Environment Variables for Testing
- **PREPUBLISH=true** - Set during pre-publish tests
- Tests generally don't rely on env vars (prefer programmatic config)

## Coverage Reporting

### Generate Coverage Report
```bash
npm run coverage                  # HTML coverage report
npm run unit:report               # Coverage with line reporter
```

### Coverage Output
- **HTML Report**: `coverage/index.html` (open in browser)
- **Terminal**: Line-by-line coverage summary

### Coverage Requirements
- **Line Coverage**: 100% required for CI
- **CI Coverage Check**:
  ```bash
  npm run coverage:ci-check-coverage
  # Runs: borp --coverage --check-coverage --lines 100
  ```

### View Coverage
```bash
npm run coverage                  # Generate report
open coverage/index.html          # macOS
xdg-open coverage/index.html      # Linux
```

### Coverage Best Practices
- Aim for 100% line coverage (enforced in CI)
- Focus on meaningful tests, not just coverage numbers
- Cover edge cases and error paths
- Use coverage reports to identify untested code paths

## Real Dependencies vs Mocks

### When to Use Real Dependencies

#### ✅ Use Real (Preferred)
- **Core Fastify Components**: Server, router, request/reply objects
- **Business Logic**: Internal functions, utilities, validators
- **In-Process Services**: Plugin system, decorators, hooks
- **Synchronous Operations**: Pure functions, transformations

#### Example: Testing with Real Fastify Instance
```javascript
test('real dependency example', async t => {
  const fastify = Fastify({ logger: false })
  
  // Register real plugins
  await fastify.register(require('fastify-plugin'))
  
  fastify.get('/real', async () => ({ status: 'ok' }))
  
  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())
  
  // Use real HTTP client (fetch)
  const response = await fetch(getServerUrl(fastify) + '/real')
  t.assert.strictEqual(response.status, 200)
})
```

### When to Mock/Stub

#### 🎭 Mock These
- **External HTTP APIs**: Third-party services, remote APIs
- **Databases**: Use in-memory alternatives or mocks
- **File System**: For tests not specifically testing I/O
- **Network Calls**: External service dependencies
- **Time-Dependent Code**: Use `@sinonjs/fake-timers`

#### Example: Mocking External HTTP Call
```javascript
const { test } = require('node:test')
const proxyquire = require('proxyquire')

test('mocked dependency example', async t => {
  // Mock external HTTP client
  const mockedFetch = async () => ({
    json: async () => ({ data: 'mocked' })
  })
  
  const myModule = proxyquire('../lib/myModule', {
    'undici': { fetch: mockedFetch }
  })
  
  const result = await myModule.fetchData()
  t.assert.strictEqual(result.data, 'mocked')
})
```

### Testing Strategies by Component

| Component Type | Strategy | Tools |
|----------------|----------|-------|
| **Route Handlers** | Real Fastify instance | `fastify.inject()` or `fetch()` |
| **Plugins** | Real registration | `fastify.register()` |
| **Validators** | Real validation | Fastify schema validation |
| **Business Logic** | Real functions | Direct function calls |
| **External APIs** | Mock/stub | `proxyquire`, custom mocks |
| **Timers** | Fake timers | `@sinonjs/fake-timers` |
| **File I/O** | In-memory or mock | Custom implementation |

### Fastify Testing Utilities

#### Request Injection (No Network)
```javascript
const response = await fastify.inject({
  method: 'GET',
  url: '/test'
})
t.assert.strictEqual(response.statusCode, 200)
```

#### Real HTTP Requests
```javascript
await fastify.listen({ port: 0 })
const response = await fetch(getServerUrl(fastify) + '/test')
```

## Test Quality Principles & Anti-Patterns

### ✅ Principles to Follow

#### 1. Test Behavior, Not Implementation
- **Good**: Test API responses, state changes, side effects
- **Bad**: Test internal variables, private methods

#### 2. Validate Acceptance Criteria Explicitly
- Write tests that directly validate requirements
- Use descriptive test names that match acceptance criteria

#### 3. Minimize Mocking
- Prefer real instances of internal classes
- Only mock external dependencies (APIs, DBs, services)
- Never mock business logic

#### 4. Cover Positive and Negative Cases
```javascript
test('positive and negative cases', async t => {
  await t.test('valid input returns success', async t => {
    // Test happy path
  })
  
  await t.test('invalid input returns error', async t => {
    // Test error path
  })
})
```

#### 5. Focus on Meaningful Assertions
- Avoid testing framework behavior
- Assert on actual business outcomes
- Verify error messages, status codes, data correctness

### ❌ Anti-Patterns to Avoid

#### 1. Heavy Mocking of Internal Classes
```javascript
// ❌ BAD: Mocking internal Fastify components
const mockReply = { send: sinon.stub() }
const mockRequest = { body: {} }
myHandler(mockRequest, mockReply)

// ✅ GOOD: Use real Fastify instance
const fastify = Fastify()
fastify.get('/', myHandler)
const response = await fastify.inject({ url: '/' })
```

#### 2. Tests Not Tied to Acceptance Criteria
```javascript
// ❌ BAD: Testing implementation details
test('sets internal flag to true', t => {
  const obj = new MyClass()
  obj.doSomething()
  t.assert.strictEqual(obj._internalFlag, true)
})

// ✅ GOOD: Testing behavior
test('returns success status after processing', async t => {
  const obj = new MyClass()
  const result = await obj.doSomething()
  t.assert.strictEqual(result.status, 'success')
})
```

#### 3. Testing Framework Behavior
```javascript
// ❌ BAD: Testing Fastify internals
test('Fastify adds route to internal array', t => {
  const fastify = Fastify()
  fastify.get('/test', () => {})
  t.assert.strictEqual(fastify._routes.length, 1) // Testing framework
})

// ✅ GOOD: Testing route works
test('GET /test returns expected response', async t => {
  const fastify = Fastify()
  fastify.get('/test', () => ({ ok: true }))
  const response = await fastify.inject({ url: '/test' })
  t.assert.deepStrictEqual(response.json(), { ok: true })
})
```

#### 4. Brittle Tests Coupled to Implementation
- Avoid testing exact internal method call sequences
- Don't assert on private properties
- Focus on public API and contracts

#### 5. Monolithic Tests Hard to Debug
```javascript
// ❌ BAD: One giant test
test('entire feature', async t => {
  // 200 lines of setup, assertions, and logic
})

// ✅ GOOD: Multiple focused tests
test('feature: handles valid input', async t => { ... })
test('feature: rejects invalid input', async t => { ... })
test('feature: handles edge case', async t => { ... })
```

## Execution Guidance

### Local Development
1. Run `npm install` to install dependencies
2. Run `npm test` before committing changes
3. Use `npm run test:watch` during active development
4. Check coverage with `npm run coverage`
5. Fix linting with `npm run lint:fix`

### CI Environment
- GitHub Actions runs full test suite on every PR
- All CI checks must pass before merge
- Coverage requirement: 100% line coverage
- No force pushes to `main`

### Pre-Commit Testing
```bash
npm run lint                      # Check code style
npm test                          # Run all tests
npm run test:validator:integrity  # Verify build artifacts
```

### Minimum Coverage Thresholds
- **Lines**: 100% (enforced in CI)
- **Branches**: Not explicitly enforced, but aim for high coverage
- **Functions**: Not explicitly enforced, but aim for high coverage

### Performance Testing
```bash
npm run benchmark                 # Run HTTP benchmarks
npm run benchmark:parser          # Parser benchmarks
npm run bench                     # Branch comparison benchmarks
```

---

**Test Framework**: borp (Node.js native test runner wrapper)  
**Coverage Tool**: c8  
**Assertion Style**: Node.js native `t.assert` API  
**Mocking Library**: proxyquire, @sinonjs/fake-timers  

**Last Updated**: 2026-02-24  
**Fastify Version**: 5.7.4  
**Protocol Version**: 2.16.0
