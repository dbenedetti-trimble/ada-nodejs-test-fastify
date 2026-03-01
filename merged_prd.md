**Repository**: `https://github.com/dbenedetti-trimble/ada-nodejs-test-fastify`

---


# Context & Problem


## Problem statement

- **Who is affected?** Contributors to Fastify's core who maintain two parallel representations of the same API: JavaScript implementation in `lib/` and hand-written TypeScript declarations in `types/`. Changes to one frequently drift from the other.
- **What is the issue?** Fastify's core is JavaScript with separate `.d.ts` type definitions maintained by hand. The route module (`lib/route.js`, 477 lines) is one of the most complex and frequently changed modules, with types defined separately in `types/route.d.ts` (196 lines). These two files describe the same API surface but can diverge silently -- a new route option added in JS but missed in the `.d.ts` produces no error until a user reports it. There is no TypeScript compilation step in the project today.
- **Why does it matter?** Migrating a core module to TypeScript proves that a gradual JS-to-TS migration is feasible for Fastify without disrupting the existing codebase. The route module is the hardest candidate (complex closure pattern, many internal dependencies), making it the ideal proof-of-concept. If this works, subsequent modules can follow the same pattern. If it's too complex, the PRD includes a scoped fallback to `lib/context.js` (95 lines).

## Success metrics


|                Metric                |                  Baseline                  |                               Target                                |            Validation method             |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| Route module source is TypeScript    | `lib/route.js` (477 lines of JS)           | `lib/route.ts` with proper type annotations                         | File exists, compiles without errors     |
| Build produces equivalent JavaScript | No build step                              | `tsc` produces `lib/route.js` identical in behavior to the original | All existing tests pass (`npm run unit`) |
| TypeScript strict mode               | N/A                                        | Compiles under `strict: true`                                       | `tsc --noEmit` passes                    |
| No public API changes                | Current API surface                        | Identical exports, identical runtime behavior                       | Existing tests pass without modification |
| Type definitions stay consistent     | Hand-written `types/route.d.ts`            | Generated or verified-consistent declarations                       | `npm run test:typescript` passes         |
| Dependent modules unchanged          | `require('./route')` in other `lib/` files | Same `require('./route')` calls, no changes needed                  | Grep for imports, existing tests pass    |


# Scope & Constraints


## In scope

- Converting `lib/route.js` to `lib/route.ts` with proper TypeScript type annotations
- Adding a `tsconfig.json` at the project root for compiling the migrated module
- Adding a build script that compiles `lib/route.ts` to `lib/route.js` (the compiled output replaces the original JS file)
- Creating minimal `.d.ts` stub files for `lib/` modules that `route.ts` imports (so the TS compiler knows their shapes)
- Wiring the build step into the existing workflow (`pretest`, `prebuild` scripts in `package.json`)
- Verifying that all existing tests pass without any test file modifications
- Verifying that `npm run test:typescript` still passes (existing type tests)

## Reduced scope fallback


If `lib/route.js` proves too complex for a clean migration (e.g., the closure-based factory pattern resists typing, or the number of internal symbol imports makes stub creation impractical), the migration target falls back to `lib/context.js` (95 lines). The same infrastructure (tsconfig, build scripts, stubs) applies; only the converted file changes. The PRD requirements below are written for `lib/route.js` but apply identically to `lib/context.js` if the fallback is triggered.


## Out of scope

- Migrating any other `lib/` module beyond the target (one module only)
- Converting tests to TypeScript
- Changing the public `types/` declarations (they remain hand-written; the goal is source-level TS, not replacing the public type surface)
- Switching the project from CommonJS to ESM
- Adding runtime TypeScript execution (`ts-node`, `tsx`, etc.) -- TypeScript is compile-time only
- Changing any existing test files

## Dependencies & Risks

- **No new runtime dependencies.** TypeScript is a devDependency only (already present: `~5.9.2`). The compiled output is plain JavaScript.
- **Build step introduction**: This is the first time a compile step is required before running code. The build must be wired into `pretest` (and documented) so that `npm test` still works as a single command. This is the biggest process change.
- **Closure pattern complexity**: `lib/route.js` uses a factory function (`buildRouting`) that returns a closure over many internal variables. Typing this pattern requires careful use of interfaces for the returned object and explicit typing of closed-over state. This is the primary technical risk.
- **Internal symbol imports**: `route.js` imports ~20 symbols from `./symbols.js`, plus types/constructors from `./context`, `./errors`, `./hooks`, `./schemas`, `./validation`, etc. Each needs at least a minimal `.d.ts` stub for the TS compiler. These stubs only need to describe what `route.ts` actually uses, not the full API of each module.
- **Test runner compatibility**: Tests must continue using `node:test` via `borp`. The compiled `lib/route.js` must be consumable by the existing test infrastructure without changes.
- **Git history**: The migration creates a new `lib/route.ts` and the old `lib/route.js` becomes a build artifact. The commit should clearly show the rename + type annotation changes.

# Functional Requirements


## MIG-1: TypeScript compilation infrastructure


**Required behavior:**


Add a `tsconfig.json` at the project root that compiles TypeScript sources in `lib/` to JavaScript output in the same directory.


Configuration requirements:


```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "declaration": false,
    "outDir": ".",
    "rootDir": ".",
    "allowJs": false,
    "skipLibCheck": true,
    "sourceMap": false
  },
  "include": ["lib/**/*.ts"],
  "exclude": ["node_modules", "test"]
}
```


Key choices:

- `target: ES2022` matches Fastify's Node.js 20+ requirement
- `module: commonjs` matches the existing module system
- `strict: true` as specified in the sequence plan
- `declaration: false` because public types are hand-maintained in `types/`
- `allowJs: false` so the compiler only processes `.ts` files, leaving JS files untouched
- No source maps (Fastify doesn't ship source maps today)

**Acceptance criteria:**

- `tsconfig.json` exists at project root
- `npx tsc` compiles successfully with no errors
- Only `.ts` files in `lib/` are compiled; all `.js` files are untouched
- Compiled output for `lib/route.ts` lands at `lib/route.js`
- The compiled `lib/route.js` is valid CommonJS (uses `require`, `module.exports`)

## MIG-2: Build script integration


**Required behavior:**


Add build scripts to `package.json` that compile TypeScript before tests or other operations:


```json
{
  "scripts": {
    "build:ts": "tsc",
    "pretest": "npm run build:ts",
    "pretest:ci": "npm run build:ts"
  }
}
```


The `pretest` script ensures `npm test` (which runs `npm run lint && npm run unit && npm run test:typescript`) always works with freshly compiled output. The build step must be fast enough to not noticeably slow the test cycle (compiling a single `.ts` file should take under 2 seconds).


**Acceptance criteria:**

- `npm run build:ts` compiles all `.ts` files in `lib/` without errors
- `npm test` still works as a single command (pretest runs automatically)
- `npm run unit` works after `npm run build:ts` has been run at least once
- The build step does not interfere with `npm run lint` (ESLint should ignore `.ts` files or be configured accordingly)

## MIG-3: Internal module type stubs


**Required behavior:**


Create minimal TypeScript declaration files (`.d.ts`) for the `lib/` modules that `route.ts` imports. These stubs describe only the exports that `route.ts` actually uses, not the full API of each module.


Modules that `route.js` currently imports from:

- `./context` (Context constructor)
- `./handle-request` (handleRequest function)
- `./hooks` (hook runners, lifecycle hook names)
- `./schemas` (normalizeSchema)
- `./head-route` (parseHeadOnSendHandlers)
- `./validation` (compileSchemasForValidation, compileSchemasForSerialization)
- `./errors` (FST_ERR_* error constructors)
- `./symbols` (~20 Symbol constants)
- `./error-handler` (buildErrorHandler)
- `./logger-factory` (createChildLogger)
- `./req-id-gen-factory` (getGenReqId)
- `./warnings` (FSTDEP022)

Each stub file is named `lib/<module>.d.ts` (e.g., `lib/context.d.ts`, `lib/symbols.d.ts`).


**Acceptance criteria:**

- Every module imported by `route.ts` has a corresponding `.d.ts` stub in `lib/`
- Each stub exports only the symbols that `route.ts` uses
- Stubs use `any` for complex internal types that are not worth fully specifying (this is pragmatic, not aspirational)
- The stubs do not conflict with the public `types/` declarations (they are internal-only)
- `route.ts` compiles without errors using these stubs

## MIG-4: Convert lib/route.js to lib/route.ts


**Required behavior:**


Rename `lib/route.js` to `lib/route.ts` and add TypeScript type annotations throughout. The conversion must:

1. **Preserve all exports**: `buildRouting`, `validateBodyLimitOption`, `buildRouterOptions` must remain exported with identical signatures
2. **Type the factory pattern**: The `buildRouting` function returns an object with many methods. Define an interface (e.g., `RoutingApi`) for this return type
3. **Type function parameters**: All function parameters get explicit types. Use specific types where the intent is clear, `any` where the type is genuinely dynamic or would require typing half the codebase
4. **Type internal state**: Variables closed over by `buildRouting` get explicit types where non-obvious
5. **Preserve CommonJS**: The compiled output must use `require`/`module.exports`, not ESM `import`/`export`. Use `export =` or `module.exports` assignment pattern compatible with TS CommonJS output
6. **No behavioral changes**: The compiled JavaScript must behave identically to the original. No logic changes, no reordering, no refactoring beyond what's required for type safety

**Guidance on type strictness:**

- Function parameters and return types: always annotated
- Local variables: let TypeScript infer where it can; annotate where inference fails under `strict: true`
- Callback parameters in hook runners: type as the specific hook signature where known, `Function` or `(...args: any[]) => any` where the hook type varies
- FindMyWay integration: use the types from `find-my-way`'s own `.d.ts` where available; cast where needed
- Internal symbols: type as `unique symbol` using `Symbol.for()` patterns

**Acceptance criteria:**

- `lib/route.ts` exists and compiles under `strict: true` with no errors
- `lib/route.ts` exports `buildRouting`, `validateBodyLimitOption`, and `buildRouterOptions`
- The compiled `lib/route.js` is functionally identical to the original
- All existing tests pass without modification (`npm run unit`)
- No `// @ts-ignore` or `@ts-expect-error` comments except where unavoidable (document each one with a reason)
- The module follows the same CommonJS require pattern when compiled (other modules still do `const { buildRouting } = require('./route')`)

## MIG-5: ESLint configuration update


**Required behavior:**


Update the ESLint configuration to handle the presence of `.ts` files in `lib/`:

- If ESLint is configured to lint `lib/`, either:
	- Add `.ts` to the ignore patterns (since the TS compiler handles type checking), or
	- Add `@typescript-eslint/parser` and minimal TS-aware rules for `.ts` files
- The simpler approach (ignoring `.ts` in ESLint) is preferred unless the project already has TS ESLint support

**Acceptance criteria:**

- `npm run lint` passes without errors
- `.ts` files in `lib/` are either properly linted with TS-aware rules or explicitly ignored
- No lint configuration changes affect existing `.js` file linting

## MIG-6: .gitignore update for compiled output


**Required behavior:**


Since `lib/route.js` is now a build artifact (compiled from `lib/route.ts`), it should either:


**Option A (preferred):** Be committed to the repository so that consumers who clone the repo can use it without a build step. Add a comment in the file header noting it's generated.


**Option B:** Be added to `.gitignore` with a `prepare` script that compiles on `npm install`. This is cleaner but breaks `git clone && npm test` without an explicit build step.


The choice should match Fastify's contributor experience expectations. Option A is more conservative and less disruptive.


**Acceptance criteria:**

- The compiled `lib/route.js` is available after `npm install` (either committed or built via prepare script)
- `npm test` works on a fresh clone without manual build steps
- The approach is documented in the PR description

# Technical Solution


## Architecture & Components


**New files:**


|             File              |                                Purpose                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| `tsconfig.json`               | TypeScript compiler configuration                                      |
| `lib/route.ts`                | Migrated route module (TypeScript source)                              |
| `lib/context.d.ts`            | Type stub for `./context`                                              |
| `lib/handle-request.d.ts`     | Type stub for `./handle-request`                                       |
| `lib/hooks.d.ts`              | Type stub for `./hooks`                                                |
| `lib/schemas.d.ts`            | Type stub for `./schemas`                                              |
| `lib/head-route.d.ts`         | Type stub for `./head-route`                                           |
| `lib/validation.d.ts`         | Type stub for `./validation`                                           |
| `lib/errors.d.ts`             | Type stub for `./errors` (internal, separate from `types/errors.d.ts`) |
| `lib/symbols.d.ts`            | Type stub for `./symbols`                                              |
| `lib/error-handler.d.ts`      | Type stub for `./error-handler`                                        |
| `lib/logger-factory.d.ts`     | Type stub for `./logger-factory`                                       |
| `lib/req-id-gen-factory.d.ts` | Type stub for `./req-id-gen-factory`                                   |
| `lib/warnings.d.ts`           | Type stub for `./warnings`                                             |


**Modified files:**


|               File               |                   Change                    |
| -------------------------------- | ------------------------------------------- |
| `package.json`                   | Add `build:ts` script, add `pretest` script |
| `.eslintrc` / `eslint.config.js` | Ignore or configure `.ts` files in `lib/`   |


**Removed files:**


|           File            |                     Reason                      |
| ------------------------- | ----------------------------------------------- |
| `lib/route.js` (original) | Replaced by compiled output from `lib/route.ts` |


## Implementation approach


**Phase 1: Infrastructure (MIG-1, MIG-2, MIG-5, MIG-6)**

1. Add `tsconfig.json` at project root
2. Add `build:ts` and `pretest` scripts to `package.json`
3. Update ESLint to handle `.ts` files
4. Verify `npm test` still passes (no TS files to compile yet, but the infra is in place)

**Phase 2: Type stubs (MIG-3)**

1. For each module imported by `route.js`, create a minimal `.d.ts` stub
2. Each stub only needs to declare the exports used by `route.js`
3. Use `any` liberally for complex internal types -- perfection is not the goal

Example stub for `lib/symbols.d.ts`:


```typescript
export const kRoutePrefix: unique symbol;
export const kSupportedHTTPMethods: unique symbol;
export const kFourOhFourContext: unique symbol;
```


Example stub for `lib/context.d.ts`:


```typescript
declare class Context {
  constructor(
    schema: any,
    handler: Function,
    reply: any,
    config: any,
    errorHandler: any,
    bodyLimit: number,
    logLevel: string,
    logSerializers: any,
    attachValidation: boolean,
    validatorCompiler: any,
    serializerCompiler: any,
    replySerializer: any,
    schemaErrorFormatter: any,
    exposeHeadRoute: boolean,
    prefixTrailingSlash: string,
    server: any,
    isFastify: boolean
  );
}
export = Context;
```


**Phase 3: Migration (MIG-4)**

1. Copy `lib/route.js` to `lib/route.ts`
2. Convert `require` statements to TypeScript `import` syntax (for the TS compiler; output will still be `require`)
3. Add type annotations to all function signatures
4. Define interfaces for complex object types (the `buildRouting` return value, route options, etc.)
5. Fix any `strict: true` errors iteratively
6. Compile and verify all tests pass
7. Remove the original `lib/route.js` (replaced by compiled output)

## Key typing challenges


**The buildRouting closure pattern:**


```typescript
interface RoutingApi {
  setup: (options: any, fastifyArgs: any) => void;
  routing: any;
  route: (opts: RouteRegistrationOptions) => void;
  hasRoute: (opts: any) => boolean;
  prepareRoute: (opts: any) => void;
  routeHandler: (req: any, res: any, params: any, context: any, query: any) => void;
  closeRoutes: () => void;
  printRoutes: (opts?: any) => string;
  addConstraintStrategy: (strategy: any) => void;
  hasConstraintStrategy: (strategyName: string) => boolean;
  isAsyncConstraint: () => boolean;
  findRoute: (opts: any) => any;
}
```


**Symbol-keyed properties:**


Symbols used as property keys (e.g., `request[kRouteContext]`) need declaration merging or indexed access types. For internal usage, casting is acceptable:


```typescript
(request as any)[kRouteContext] = context;
```


**FindMyWay types:**


`find-my-way` ships its own TypeScript types. The `routing` object from `FindMyWay()` should be typed using the library's exported types. Install `@types/find-my-way` if needed (check if it's already typed).


## Dependency changes

- **Runtime**: None
- **Dev**: No new devDependencies needed. `typescript` (~5.9.2) is already installed. If `find-my-way` doesn't have built-in types, `@types/find-my-way` may be needed (check first).

# Validation Contract


## VAL-01: TypeScript compiles without errors


```javascript
GIVEN lib/route.ts exists with type annotations
WHEN I run npx tsc --noEmit
THEN the compiler reports zero errors
AND strict mode is enabled
```


## VAL-02: Compiled output is valid CommonJS


```javascript
GIVEN lib/route.ts has been compiled
WHEN I inspect the compiled lib/route.js
THEN it uses require() for imports (not ESM import)
AND it uses module.exports or exports for the public API
AND other lib/ modules can require('./route') without changes
```


## VAL-03: Exports match original module


```javascript
GIVEN the compiled lib/route.js
WHEN I inspect its exports
THEN it exports buildRouting (function)
AND it exports validateBodyLimitOption (function)
AND it exports buildRouterOptions (function)
AND no other public exports exist
```


## VAL-04: All existing unit tests pass


```javascript
GIVEN all migration changes are applied
AND npm run build:ts has been run
WHEN I run npm run unit
THEN all existing tests pass
AND no test files have been modified
```


## VAL-05: TypeScript type tests pass


```javascript
GIVEN all migration changes are applied
WHEN I run npm run test:typescript
THEN tsc on test/types/import.ts passes
AND tsd type tests pass
AND no type test files have been modified
```


## VAL-06: Full test suite passes


```javascript
GIVEN all migration changes are applied
WHEN I run npm test
THEN lint passes
AND unit tests pass
AND type tests pass
AND the exit code is 0
```


## VAL-07: No ts-ignore escape hatches (or documented ones)


```javascript
GIVEN lib/route.ts
WHEN I search for @ts-ignore and @ts-expect-error comments
THEN either none exist
OR each one has an inline comment explaining why it's necessary
AND the total count is fewer than 5
```


## VAL-08: Type stubs are minimal and accurate


```javascript
GIVEN the .d.ts stub files in lib/
WHEN I compare each stub's exports to what route.ts actually imports
THEN every import used by route.ts is declared in a stub
AND no stub declares exports that route.ts does not use
```


## VAL-09: Build script works on fresh clone


```javascript
GIVEN a fresh git clone of the repository
WHEN I run npm install
AND I run npm test
THEN all tests pass without manual build steps
```


## VAL-10: ESLint passes with .ts files present


```javascript
GIVEN lib/route.ts and lib/*.d.ts files exist
WHEN I run npm run lint
THEN no lint errors are reported
AND existing .js files are still linted normally
```


## VAL-11: Fallback scope (if route.js migration is abandoned)


```javascript
GIVEN lib/route.js was too complex to migrate cleanly
AND lib/context.js (95 lines) is migrated instead
WHEN I run npm test
THEN all tests pass
AND the same infrastructure (tsconfig, build scripts, stubs) is in place
AND the migration pattern is proven for future modules
```

