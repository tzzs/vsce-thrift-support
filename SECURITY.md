# Security Policy

## Supported Versions

Security fixes are prioritized for the latest published `thrift-support` release line and the active `master` branch. Older releases may receive fixes only when the patch is low risk and the affected line is still practical to maintain.

## Reporting a Vulnerability

Report suspected vulnerabilities through GitHub Security Advisories for this repository:

https://github.com/tzzs/vsce-thrift-support/security/advisories/new

If the issue is not sensitive, use GitHub Issues:

https://github.com/tzzs/vsce-thrift-support/issues

Please include the affected version, reproduction steps, impact, and any relevant `.thrift` input. Do not publish exploit details in a public issue before maintainers have had time to investigate.

## Runtime Data and Telemetry

The current source does not implement telemetry or analytics collection.

The VS Code extension reads workspace `.thrift` files through VS Code workspace APIs to provide formatting, diagnostics, navigation, symbols, hierarchy, completion, rename, and refactor features. The extension does not start a language-server subprocess.

The CLI reads local files passed on the command line. It writes files only for explicit write operations such as `thrift-support format --write`.

## Workspace Trust

The extension currently documents its Restricted Mode behavior but does not yet declare a dedicated `capabilities.untrustedWorkspaces` manifest entry. Until that is implemented, use trusted workspaces for repositories where include traversal, diagnostics, refactors, or CLI write operations should be restricted by policy.

## Supply Chain

Release packaging is automated through GitHub Actions:

- Visual Studio Marketplace and Open VSX receive the packaged VSIX from `publish.yml`.
- The npm CLI package is published with OIDC trusted publishing and provenance.
- CI gates include lint, build, tests, coverage, CLI dogfood, package smoke, and performance assertions.

See [docs/release-verification.md](docs/release-verification.md) for the current release verification chain.
