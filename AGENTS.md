# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript source for the VS Code extension (providers, formatter, diagnostics, extension entry).
- `src/utils/`: shared helpers (file watching, caching, error handling).
- `src/formatter/`: formatting engine (pure formatting logic).
- `src/formatting-bridge/`: VS Code formatting bridge (options/context/range helpers).
- `src/references/`: reference search helpers (AST cache, traversal, file list, symbol type).
- `syntaxes/` and `language-configuration.json`: TextMate grammar and language config for Thrift.
- `tests/`: Node-based test scripts (most files follow `tests/test-*.js`).
- `test-files/` and `test-thrift/`: fixture Thrift files used by tests.
- `out/`: compiled JS output from `tsc` (generated).
- Diagnostics entrypoint lives at `src/diagnostics/index.ts` (avoid `src/diagnostics.ts`).

## Build, Test, and Development Commands

- `npm install`: install dependencies (Node 22.18.0 is expected).
- `npm run compile`: TypeScript build into `out/`.
- `npm run watch`: incremental build in watch mode.
- `npm run lint` / `npm run lint:fix`: ESLint checks and autofix for `src/`.
- `npm run test`: run the unified test suite.
- `npm run test:all`: run the full test matrix (formatting, enums, consts, etc.).
- `npm run coverage`: run tests with NYC coverage report.
- `npm run package`: build a `.vsix` extension package.

## Coding Style & Naming Conventions

- Language: TypeScript for extension logic, JavaScript for test runners.
- Indentation: follow existing TS style; Thrift formatter defaults to 4-space indentation.
- Naming: files in `tests/` use `test-*.js`; providers follow the `*-provider.ts` pattern.
- File naming: use `kebab-case`.
- Type files: `xxx.types.ts`
- Enums: `xxx.enum.ts`
- Classes: `xxx-service.ts` / `xxx-controller.tsx`
- Hooks: `use-xxx.ts`
- DTOs: `xxx.dto.ts`
- Barrel exports: `index.ts`
- Linting: keep ESLint clean before submitting.
- 代码修改后必须执行 `npm run lint:fix` 并解决所有代码规范问题。

## Testing Guidelines

### Test Framework

- All tests use **Mocha** framework with describe/it structure
- Test files located in `tests/src/**/*.js`
- Run tests with `npm test` (uses `.mocharc.json` configuration)
- Coverage reports generated with `npm run coverage` (NYC)

### Mock Structure Standards

#### Unified VSCode Mock via require-hook.js (Default)

- **MUST** use the automatic mock injection via `require-hook.js` mechanism
- The require-hook automatically intercepts all `require('vscode')` calls
- **DO NOT** manually create mock objects or override `Module.prototype.require`
- Simply require the tested module - mock is automatically injected:
  ```javascript
  // Mock is automatically set up by .mocharc.json -> require-hook.js
  const {ThriftParser} = require('../../../out/ast/parser.js');
  
  describe('parser', () => {
      it('should parse thrift code', () => {
          const parser = new ThriftParser('struct User {}');
          const ast = parser.parse();
          assert.ok(ast);
      });
  });
  ```

#### Custom Mock Extensions (Advanced Use Cases Only)

- Only use `createVscodeMock()` when tests need **specific custom behavior**
- This is the exception, not the rule
- When needed:
  ```javascript
  const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
  
  const vscode = createVscodeMock({
      workspace: {
          // Custom implementations MUST include all default methods
          findFiles: async () => [/* custom test data */],
          openTextDocument: async (uri) => {/* custom document */},
          
          // Include all other workspace methods from default mock
          fs: { /* ... */ },
          textDocuments: [],
          getConfiguration: () => ({...}),
          createFileSystemWatcher: () => ({...}),
          // ... all other methods
      }
  });
  installVscodeMock(vscode);
  
  // Then require tested module
  const {CustomProvider} = require('../../../out/custom-provider.js');
  ```
- **CRITICAL**: Custom workspace objects MUST include ALL methods from the default mock
- Missing methods will cause "Cannot read properties of undefined" errors

#### Mocha Test Structure Requirements

1. **All tests MUST be wrapped in describe/it blocks**:
   ```javascript
   describe('feature-name', () => {
       it('should test specific behavior', async () => {
           await testFunction();
       });
   });
   ```

2. **NO top-level function calls** (anti-patterns):
   ```javascript
   // ❌ BAD - runs outside Mocha
   run().catch(err => process.exit(1));
   
   // ❌ BAD - direct execution
   testSomething();
   
   // ✅ GOOD - wrapped in Mocha
   describe('test-name', () => {
       it('should pass', async () => {
           await run();
       });
   });
   ```

3. **Async test handling**:
    - Mark `it()` as `async` if the test function is async
    - Use `await` when calling async test functions
    - Remove `.catch()` error handlers (Mocha handles this)

4. **Require statements placement**:
    - All `require()` statements MUST be at the top level (file scope)
    - **NEVER** place require inside describe/it blocks
    - Mock is automatically injected via require-hook.js (configured in .mocharc.json)
    - No need to manually call `installVscodeMock()` in most cases

#### Common Mock Pitfalls to Avoid

1. **Missing VSCode API methods**:
    - `languages.createDiagnosticCollection` - required for diagnostics tests
    - `CodeActionKind`, `CodeAction`, `WorkspaceEdit` - required for code action tests
    - `workspace.createFileSystemWatcher` - required for file watching tests

2. **TextDocument mock requirements**:
    - MUST include `uri` property (not just `fsPath`)
    - MUST include `getText()`, `lineAt()` methods
    - MUST include `languageId` property set to 'thrift'

3. **Path handling**:
    - Always normalize path separators before comparison
    - Use `path.normalize()` or replace `\\` with `/` on Windows
    - Test paths should use forward slashes internally

### Test File Organization

- Tests are Node scripts under `tests/` and rely on fixture files under `test-files/`
- Prefer adding focused scripts (e.g., `tests/src/test-<feature>.js`)
- Run at least `npm run test` and any relevant targeted script before PR
- All commits must pass `npm run test` (full test suite) before submitting

### Debugging Test Failures

1. Check if require-hook.js is properly loaded (via .mocharc.json)
2. Verify custom mocks (if used) include all required methods
3. Ensure tests are wrapped in describe/it blocks
4. Check for require statements inside test functions
5. Verify async/await handling is correct
6. Confirm test files don't manually override Module.prototype.require

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) per `DEVELOPMENT.md`.
- PRs should include a clear description, test evidence (commands run), and links to related issues if applicable.
- For formatter or diagnostics changes, add or update a test script and fixture demonstrating the behavior.

## Configuration & Release Notes

- Node version must match CI (22.18.0).
- Packaging and publishing use `@vscode/vsce`; see `DEVELOPMENT.md` for release flow details.
