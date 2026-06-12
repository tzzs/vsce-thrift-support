const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const unicodeScan = require('../../../scripts/check-invisible-unicode.js');

describe('invisible unicode security scan', () => {
    it('detects bidirectional and zero-width control characters with locations', () => {
        const findings = unicodeScan.scanText('namespace js demo\u202E\nstruct User {\n  1: string na\u200Bme\n}', 'demo.thrift');

        assert.deepStrictEqual(findings.map((finding) => finding.codePoint), ['U+202E', 'U+200B']);
        assert.deepStrictEqual(findings.map((finding) => finding.line), [1, 3]);
        assert.deepStrictEqual(findings.map((finding) => finding.column), [18, 15]);
    });

    it('allows explicit invisible-unicode fixtures while scanning real source paths', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrift-unicode-scan-'));
        const sourceFile = path.join(root, 'packages', 'core', 'src', 'bad.ts');
        const fixtureFile = path.join(root, 'tests', 'fixtures', 'security', 'invisible-unicode', 'bad.thrift');

        fs.mkdirSync(path.dirname(sourceFile), {recursive: true});
        fs.mkdirSync(path.dirname(fixtureFile), {recursive: true});
        fs.writeFileSync(sourceFile, 'const name = "bad\u202E";\n');
        fs.writeFileSync(fixtureFile, 'const string marker = "allowed\u202E"\n');

        const findings = unicodeScan.scanRepository({
            root,
            targets: ['packages', 'tests/fixtures/security/invisible-unicode'],
            allowedPaths: ['tests/fixtures/security/invisible-unicode']
        });

        assert.deepStrictEqual(findings.map((finding) => path.relative(root, finding.file)), [
            path.join('packages', 'core', 'src', 'bad.ts')
        ]);
    });
});
