# Release Channels

This document records the release-channel policy for the VS Code extension, Open VSX package, and companion npm CLI.

## Current Stable Channel

Stable releases continue to use the existing release chain:

1. Conventional commits feed release-please.
2. The release PR updates versions and changelog metadata.
3. A published GitHub Release with a `thrift-support-v*` tag triggers `publish.yml`.
4. The workflow packages the VSIX, uploads it to GitHub Releases, publishes to Visual Studio Marketplace and Open VSX, and publishes the CLI package to npm.

See [release-verification.md](release-verification.md) for the verification chain.

## Pre-Release Policy

Pre-release is reserved for user-visible behavior that needs adoption feedback before stable release, such as Web/Codespaces support, large diagnostics-scope changes, or experimental agent integrations.

Version intent:

- Stable releases should prefer even minor versions when a feature line is ready for broad adoption.
- Pre-release experiments should prefer odd minor versions while behavior is still being validated.
- Visual Studio Marketplace pre-release publishing requires `vsce publish --pre-release`.

Open VSX and npm behavior must be confirmed before any automatic pre-release workflow is enabled. Until then, pre-release publishing remains a manual maintainer decision rather than a default CI path.

## Adoption Metrics

Use the manual metrics script to inspect channel adoption:

```bash
npm run metrics:marketplace
```

The script returns JSON:

```json
{
  "visualStudioMarketplace": {
    "version": "x.y.z",
    "installs": 0,
    "ratingCount": 0
  },
  "openVsx": {
    "version": "x.y.z",
    "downloads": 0
  }
}
```

The script is intentionally not a CI gate because it depends on external network APIs and Marketplace availability.
