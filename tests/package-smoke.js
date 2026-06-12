const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI_PACKAGE_DIR = path.join(REPO_ROOT, 'packages', 'cli');

const REQUIRED_VSIX_FILES = [
    'extension/package.json',
    'extension/dist/extension.js',
    'extension/syntaxes/thrift.tmLanguage.json',
    'extension/language-configuration.json',
    'extension/readme.md',
    'extension/changelog.md',
    'extension/LICENSE.txt',
    'extension/SECURITY.md',
    'extension/docs/security-model.md',
    'extension/docs/release-channels.md',
    'extension/docs/adr/0001-lsp-strategy.md'
];

const REQUIRED_CLI_TARBALL_FILES = [
    'package/dist/cli.js',
    'package/dist/cli.js.map',
    'package/README.md',
    'package/LICENSE',
    'package/package.json'
];

const REQUIRED_ROOT_METADATA = {
    license: 'MIT',
    homepage: 'https://github.com/tzzs/vsce-thrift-support#readme',
    qna: 'https://github.com/tzzs/vsce-thrift-support/discussions',
    pricing: 'Free'
};

function execFile(command, args, options = {}) {
    return childProcess.execFileSync(command, args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        ...options,
        env: {
            ...process.env,
            ...options.env
        },
        stdio: options.stdio || ['ignore', 'pipe', 'pipe']
    });
}

function makeTempDir(name) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function assertContainsAll(actualEntries, requiredEntries, artifactName) {
    const actual = new Set(actualEntries);
    const missing = requiredEntries.filter((entry) => !actual.has(entry));

    assert.deepStrictEqual(missing, [], `${artifactName} is missing required files`);
}

function listVsixEntries(vsixPath) {
    return execFile('unzip', ['-Z1', vsixPath]).trim().split(/\r?\n/).filter(Boolean);
}

function readVsixJson(vsixPath, entryPath) {
    return JSON.parse(execFile('unzip', ['-p', vsixPath, entryPath]));
}

function assertTrustMetadata(manifest, label) {
    for (const [key, expected] of Object.entries(REQUIRED_ROOT_METADATA)) {
        assert.strictEqual(manifest[key], expected, `${label} must declare ${key}`);
    }

    assert.deepStrictEqual(
        manifest.bugs,
        {url: 'https://github.com/tzzs/vsce-thrift-support/issues'},
        `${label} must declare the issue tracker`
    );
    assert.deepStrictEqual(
        manifest.galleryBanner,
        {color: '#0F172A', theme: 'dark'},
        `${label} must declare a Marketplace gallery banner`
    );
}

function runVsixSmoke() {
    const tmpDir = makeTempDir('thrift-support-vsix-smoke');
    const vsixPath = path.join(tmpDir, 'thrift-support-smoke.vsix');

    execFile('pnpm', ['exec', 'vsce', 'package', '-o', vsixPath], {
        stdio: 'inherit'
    });

    assert.ok(fs.existsSync(vsixPath), `VSIX was not created at ${vsixPath}`);
    assertContainsAll(listVsixEntries(vsixPath), REQUIRED_VSIX_FILES, 'VSIX package');
    assertTrustMetadata(readVsixJson(vsixPath, 'extension/package.json'), 'VSIX manifest');
}

function packCli(tmpDir) {
    const output = execFile('npm', ['pack', '--json', '--pack-destination', tmpDir], {
        cwd: CLI_PACKAGE_DIR,
        env: {
            npm_config_cache: path.join(tmpDir, 'npm-cache')
        }
    });
    const [packInfo] = JSON.parse(output);

    assert.ok(packInfo && packInfo.filename, 'npm pack did not return package metadata');

    return path.join(tmpDir, packInfo.filename);
}

function listTarballEntries(tarballPath) {
    return execFile('tar', ['-tzf', tarballPath]).trim().split(/\r?\n/).filter(Boolean);
}

function runCliTarballSmoke() {
    const tmpDir = makeTempDir('thrift-support-cli-smoke');

    execFile('node', [path.join(CLI_PACKAGE_DIR, 'build.js')], {
        stdio: 'inherit'
    });

    const tarballPath = packCli(tmpDir);
    assert.ok(fs.existsSync(tarballPath), `CLI tarball was not created at ${tarballPath}`);
    assertContainsAll(listTarballEntries(tarballPath), REQUIRED_CLI_TARBALL_FILES, 'CLI tarball');

    const extractDir = path.join(tmpDir, 'extract');
    fs.mkdirSync(extractDir);
    execFile('tar', ['-xzf', tarballPath, '-C', extractDir]);

    const version = execFile('node', [path.join(extractDir, 'package', 'dist', 'cli.js'), '--version']).trim();
    const cliPackage = require(path.join(CLI_PACKAGE_DIR, 'package.json'));

    assert.strictEqual(
        version,
        `${cliPackage.name} v${cliPackage.version}`,
        'packed CLI --version must match package metadata'
    );
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function assertReleaseMetadata() {
    const releaseConfig = readJson('release-please-config.json');
    const manifest = readJson('.release-please-manifest.json');
    const rootPackage = readJson('package.json');
    const corePackage = readJson('packages/core/package.json');
    const cliPackage = readJson('packages/cli/package.json');

    assert.deepStrictEqual(Object.keys(releaseConfig.packages).sort(), ['.', 'packages/cli', 'packages/core']);
    assert.strictEqual(releaseConfig.packages['.'].component, 'thrift-support');
    assert.strictEqual(releaseConfig.packages['packages/core'].component, 'core');
    assert.strictEqual(releaseConfig.packages['packages/cli'].component, 'cli');
    assert.strictEqual(manifest['.'], rootPackage.version);
    assert.strictEqual(manifest['packages/core'], corePackage.version);
    assert.strictEqual(manifest['packages/cli'], cliPackage.version);
    assertTrustMetadata(rootPackage, 'root package.json');
}

function runFromCli(args = process.argv.slice(2)) {
    const vsixOnly = args.includes('--vsix-only');
    const cliOnly = args.includes('--cli-only');

    assertReleaseMetadata();

    if (!cliOnly) {
        runVsixSmoke();
    }

    if (!vsixOnly) {
        runCliTarballSmoke();
    }
}

if (require.main === module) {
    runFromCli();
}

module.exports = {
    REQUIRED_CLI_TARBALL_FILES,
    REQUIRED_VSIX_FILES,
    assertReleaseMetadata,
    runCliTarballSmoke,
    runFromCli,
    runVsixSmoke
};
