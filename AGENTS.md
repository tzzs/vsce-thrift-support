# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source for the VS Code extension (providers, formatter, diagnostics, extension entry).
- `src/utils/`: shared helpers (file watching, caching, error handling).
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

## Testing Guidelines
- Tests are Node scripts under `tests/` and rely on fixture files under `test-files/`.
- Prefer adding focused scripts (e.g., `tests/test-<feature>.js`) and wire them into `npm run test:all` if needed.
- Run at least `npm run test` and any relevant targeted script before PR.
- All commits must pass `npm run test` (full test suite) before submitting.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) per `DEVELOPMENT.md`.
- PRs should include a clear description, test evidence (commands run), and links to related issues if applicable.
- For formatter or diagnostics changes, add or update a test script and fixture demonstrating the behavior.

## Configuration & Release Notes
- Node version must match CI (22.18.0).
- Packaging and publishing use `@vscode/vsce`; see `DEVELOPMENT.md` for release flow details.
