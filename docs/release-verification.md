# Release Verification

This document records the current release chain for the VS Code extension and companion CLI.

## Release Chain

1. Conventional commits land on `master`.
2. `release-please.yml` updates or creates the release PR.
3. Merging the release PR creates the component tag and GitHub Release.
4. Publishing a root extension release with a `thrift-support-v*` tag triggers `publish.yml`.
5. `publish.yml` builds the package, creates the VSIX, uploads it to the GitHub Release, publishes the VSIX to Visual Studio Marketplace and Open VSX, and publishes the CLI package to npm with OIDC trusted publishing and provenance.

`publish.yml` is intentionally triggered by `release.published`; it does not currently expose a manual `workflow_dispatch` publish path.

## CI Gates

The `ci.yml` workflow runs on pushes and pull requests. It currently covers:

- dependency install with Node 24.x and pnpm
- core package build
- ESLint
- extension build and bundle
- CLI build
- Mocha test suite
- extension coverage
- CLI coverage
- CLI dogfood commands
- VSIX and CLI tarball package smoke checks
- parser/formatter performance benchmark
- multi-size performance assertions

## Local Verification

For documentation-only updates:

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

For package metadata or Marketplace-facing changes:

```bash
npm run smoke:package
```

For source changes:

```bash
npm run lint:fix
npm run build
npm test
```

For CLI-visible changes:

```bash
npm run coverage:cli
```

For parser, formatter, diagnostics, cache, indexing, semantic tokens, hierarchy, or workspace scanning changes:

```bash
npm run perf:benchmark
```

## Package Surface

The VSIX should contain the bundled extension, syntax grammar, language configuration, README files, license, security file, and selected docs. It should not rely on TypeScript source files at runtime.

The CLI tarball should contain the compiled CLI, source map, README, license, and package metadata.
