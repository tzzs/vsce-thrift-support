# Test Layout

## Canonical Mocha Suite

`tests/src/**/*.js` is the canonical extension/core test suite loaded by `.mocharc.json`.

## CLI Tests

`tests/cli/**/*.js` covers the CLI package and should be run through `npm run coverage:cli` when CLI behavior changes.

## Performance Tests

`tests/perf/**` contains benchmark scripts. Run `npm run perf:benchmark` after parser, formatter, diagnostics, cache, or workspace indexing changes.

## Debug And Manual Repro Scripts

`tests/debug/**` and root-level historical `tests/test-*.js` files are not part of the default Mocha contract unless explicitly wired into `.mocharc.json`.
When promoting a manual repro into a regression test, move it under `tests/src/**` and make it use top-level `require` statements.
