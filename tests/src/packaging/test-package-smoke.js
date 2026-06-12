const assert = require('assert');
const path = require('path');

describe('package smoke configuration', () => {
    it('exposes package smoke npm scripts', () => {
        const pkg = require(path.join(process.cwd(), 'package.json'));

        assert.strictEqual(pkg.scripts['smoke:package'], 'node tests/package-smoke.js');
        assert.strictEqual(pkg.scripts['smoke:package:vsix'], 'node tests/package-smoke.js --vsix-only');
        assert.strictEqual(pkg.scripts['smoke:package:cli'], 'node tests/package-smoke.js --cli-only');
        assert.strictEqual(pkg.scripts['security:unicode'], 'node scripts/check-invisible-unicode.js');
        assert.strictEqual(pkg.scripts['security:audit'], 'pnpm audit --audit-level high --registry=https://registry.npmjs.org');
        assert.strictEqual(pkg.scripts['metrics:marketplace'], 'node scripts/marketplace-metrics.js');
    });

    it('declares limited support for untrusted workspaces', () => {
        const pkg = require(path.join(process.cwd(), 'package.json'));

        assert.deepStrictEqual(pkg.capabilities.untrustedWorkspaces, {
            supported: 'limited',
            description: 'Thrift syntax, formatting, and open-file analysis are available in Restricted Mode. Workspace-wide indexing, include traversal, and generated reports may be limited until the workspace is trusted.',
            restrictedConfigurations: [
                'thrift.diagnostics.workspaceMode'
            ]
        });
    });

    it('checks required VSIX and CLI tarball contents', () => {
        const smoke = require('../../package-smoke.js');

        assert.deepStrictEqual(smoke.REQUIRED_VSIX_FILES, [
            'extension/package.json',
            'extension/dist/extension.js',
            'extension/syntaxes/thrift.tmLanguage.json',
            'extension/language-configuration.json',
            'extension/readme.md',
            'extension/changelog.md',
            'extension/LICENSE.txt'
        ]);
        assert.deepStrictEqual(smoke.REQUIRED_CLI_TARBALL_FILES, [
            'package/dist/cli.js',
            'package/dist/cli.js.map',
            'package/README.md',
            'package/LICENSE',
            'package/package.json'
        ]);
    });

    it('keeps release-please metadata aligned with package versions', () => {
        const smoke = require('../../package-smoke.js');

        assert.doesNotThrow(() => smoke.assertReleaseMetadata());
    });
});
