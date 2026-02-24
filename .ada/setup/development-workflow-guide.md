# Fastify Development Workflow Guide

## Repository Structure

### Core Directories
- **`lib/`** - Core library source files
- **`test/`** - Test files (`.test.js`, `.test.mjs` patterns)
- **`docs/`** - Comprehensive documentation
  - `docs/Guides/` - User guides and tutorials
  - `docs/Reference/` - API reference documentation
- **`examples/`** - Example applications and use cases
- **`types/`** - TypeScript type definitions
- **`build/`** - Build scripts and utilities
- **`integration/`** - Integration test files

### Key Files
- **`fastify.js`** - Main entry point (CommonJS)
- **`fastify.d.ts`** - TypeScript type definitions
- **`package.json`** - Project metadata and scripts
- **`eslint.config.js`** - ESLint configuration (neostandard)
- **`.borp.yaml`** - Test runner configuration (borp)
- **`.editorconfig`** - Editor formatting rules

## Frameworks & Dependencies

### Core Framework
- **Fastify v5.7.4** - High-performance web framework
- **Node.js** - Runtime environment (see package.json for version requirements)
- **Type**: CommonJS (with TypeScript definitions)

### Key Production Dependencies
- **@fastify/ajv-compiler** (^4.0.5) - JSON schema validation compiler
- **@fastify/error** (^4.0.0) - Error handling utilities
- **@fastify/fast-json-stringify-compiler** (^5.0.0) - Fast JSON serialization
- **pino** (^9.14.0 || ^10.1.0) - High-performance logger
- **avvio** (^9.0.0) - Plugin system
- **find-my-way** (^9.0.0) - HTTP router
- **light-my-request** (^6.0.0) - Request injection for testing

### Development Tools
- **borp** (^1.0.0) - Test runner (Node.js native test wrapper)
- **c8** - Code coverage tool
- **neostandard** (^0.12.0) - ESLint configuration
- **typescript** (~5.9.2) - TypeScript compiler
- **tsd** (^0.33.0) - TypeScript type testing
- **autocannon** (^8.0.0) - HTTP benchmarking tool

### Validation & Schema Libraries (Dev)
- **ajv** (^8.12.0) - JSON schema validator
- **ajv-errors**, **ajv-formats**, **ajv-i18n**, **ajv-merge-patch** - AJV extensions
- **fluent-json-schema** (^6.0.0) - Fluent schema builder
- **joi** (^18.0.1), **yup** (^1.4.0) - Alternative validation libraries

## Build System

### Build Tools
- **npm** - Package manager and build orchestration
- **Node.js native test runner** - Via borp wrapper
- **c8** - Coverage instrumentation

### Build Scripts
```bash
npm run build:validation          # Generate validation artifacts (error-serializer.js, config-validator.js)
npm run build:sync-version        # Synchronize version across files
```

### Build Process
1. **Validation Generation**: `node build/build-error-serializer.js && node build/build-validation.js`
2. **Version Sync**: `node build/sync-version.js`
3. **Pre-publish**: Runs tests, validation integrity check, and version sync

### Generated Files
- `lib/error-serializer.js` - Auto-generated from build scripts
- `lib/config-validator.js` - Auto-generated from build scripts

**Note**: Generated files are excluded from linting (see `eslint.config.js`)

## Dependency Management

### Install All Dependencies
```bash
npm install                       # Install all dependencies
npm ci                            # Clean install (CI environments)
```

### Add New Dependencies

#### Production Dependency
```bash
npm install <package-name>
npm install <package-name>@<version>
```

#### Development Dependency
```bash
npm install --save-dev <package-name>
npm install -D <package-name>@<version>
```

### Update Dependencies
```bash
npm update                        # Update all dependencies within semver ranges
npm update <package-name>         # Update specific package
npm outdated                      # Check for outdated packages
```

### Remove Dependencies
```bash
npm uninstall <package-name>
npm uninstall --save-dev <package-name>
```

### Dependency Best Practices
- Use exact versions or caret ranges (^) for stability
- Review `package-lock.json` changes in PRs
- Test thoroughly after dependency updates
- Check compatibility with Node.js versions supported

## Compilation

### No Compilation Required
Fastify is a **pure JavaScript (CommonJS) project** - no compilation step needed for runtime.

### TypeScript Type Checking
```bash
npm run test:typescript           # Validate TypeScript definitions
tsc test/types/import.ts --target es2022 --moduleResolution node16 --module node16 --noEmit
```

### Type Testing
```bash
tsd                               # Test TypeScript type definitions
```

### Build Artifacts
```bash
npm run build:validation          # Generate runtime validation code
```

**Note**: Source files in `lib/` and `fastify.js` are used directly - no transpilation.

## Linting & Formatting

### Linting Configuration
- **Tool**: ESLint with neostandard config
- **Config File**: `eslint.config.js`
- **Style**: Single quotes, 2-space indent, max line length 120 characters
- **Ignored Files**: Generated files in `lib/`, specific test files

### Run Linting
```bash
npm run lint                      # Run ESLint on all files
npm run lint:eslint               # Same as above
npm run lint:markdown             # Lint markdown files (markdownlint-cli2)
```

### Auto-Fix Issues
```bash
npm run lint:fix                  # Auto-fix ESLint issues
```

### Code Formatting Rules (`.editorconfig`)
- **End of Line**: LF (Unix)
- **Indent Style**: Spaces
- **Indent Size**: 2 spaces
- **Quote Type**: Single quotes
- **Final Newline**: Required
- **Trailing Whitespace**: Trimmed (except in markdown)

### Linting Best Practices
- Run `npm run lint` before committing
- Use editor integration for real-time feedback
- Follow existing code style patterns
- Fix linting errors before submitting PRs

## Static Analysis & Security

### Security Scanning
- **Not Explicitly Configured** - Consider adding tools like:
  - `npm audit` - Check for known vulnerabilities
  - Dependabot (GitHub) - Automated dependency updates
  - Snyk - Vulnerability scanning

### Run Security Audit
```bash
npm audit                         # Check for vulnerabilities
npm audit fix                     # Auto-fix vulnerabilities where possible
```

### Code Quality Checks
- **ESLint**: Enforces code quality rules via neostandard
- **TypeScript**: Type checking ensures type safety
- **Test Coverage**: Enforced via CI (100% line coverage requirement)

### CI Checks (GitHub Actions)
- All tests must pass
- Linting must pass
- TypeScript types must be valid
- Coverage requirements must be met
- Validator integrity check must pass

## Environment Setup

### Required Environment Variables
**None explicitly required** - Fastify is configured programmatically.

### Optional Configuration
- **NODE_ENV**: Set to `production` for production optimizations
- **LOG_LEVEL**: Configure Pino logging level (if using logger)
- **PORT**: Server port (default examples use 3000 or dynamic)

### Local Development Setup

#### 1. Clone Repository
```bash
git clone https://github.com/fastify/fastify.git
cd fastify
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Run Tests
```bash
npm test
```

#### 4. Start Example Server
```bash
node examples/simple.js
```

#### 5. Run Benchmarks (Optional)
```bash
npm run benchmark
```

### Node.js Version
- Check `package.json` `engines` field for supported versions
- Use **nvm** or **fnm** to manage Node.js versions

### Editor Setup
- **Recommended**: Use `.editorconfig` plugin in your editor
- **ESLint Integration**: Enable ESLint extension for real-time linting
- **TypeScript**: TypeScript extension for type checking

### Docker Setup
**Not configured** - No Dockerfile present in repository.

To containerize:
1. Create `Dockerfile` with Node.js base image
2. Copy `package*.json` and run `npm ci`
3. Copy source files
4. Expose port and define `CMD`

## Additional Notes

### Testing Philosophy
- Use Node.js native test runner (via borp)
- Prefer real dependencies over mocks for core functionality
- Mock external HTTP calls and services
- Achieve 100% line coverage (enforced in CI)

### Contribution Workflow
1. Fork repository and create feature branch
2. Make changes following code style
3. Add tests for new functionality
4. Run `npm test` to verify
5. Submit PR with clear description
6. Requires 2+ approvals before merge

### Pre-Commit Checklist
- [ ] Tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] TypeScript types valid: `npm run test:typescript`
- [ ] Coverage maintained: `npm run coverage`
- [ ] Validator integrity intact: `npm run test:validator:integrity`

---

**Last Updated**: 2026-02-24  
**Fastify Version**: 5.7.4  
**Protocol Version**: 2.16.0
