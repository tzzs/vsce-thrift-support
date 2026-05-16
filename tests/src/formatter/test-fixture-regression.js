const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {ThriftFormatter} = require('../../../out/formatter');

const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'test-files');
const GOLDEN_DIR = path.join(__dirname, '..', '..', 'fixtures', 'golden');

const OPTIONS = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4
};

const FIXTURES = [
    'apache-thrift-test.thrift',
    'thrift_full_coverage.thrift',
    'example.thrift',
    'advanced-features.thrift',
    'nested-containers.thrift',
    'annotation-edge-cases.thrift'
];

describe('Fixture regression (golden file comparison)', function () {
    this.timeout(30000);

    for (const file of FIXTURES) {
        const srcPath = path.join(FIXTURE_DIR, file);
        const goldenName = file.replace('.thrift', '.formatted.thrift');
        const goldenPath = path.join(GOLDEN_DIR, goldenName);

        it(`${file} matches golden output`, () => {
            if (!fs.existsSync(srcPath)) {
                return;
            }
            if (!fs.existsSync(goldenPath)) {
                assert.fail(`Golden file missing: ${goldenPath}\nRun: node tests/fixtures/regenerate.js`);
            }

            const content = fs.readFileSync(srcPath, 'utf-8');
            const expected = fs.readFileSync(goldenPath, 'utf-8');
            const formatter = new ThriftFormatter();
            const actual = formatter.format(content, OPTIONS);

            if (actual !== expected) {
                const actualLines = actual.split('\n');
                const expectedLines = expected.split('\n');
                let firstDiffLine = -1;
                const maxLen = Math.max(actualLines.length, expectedLines.length);
                for (let i = 0; i < maxLen; i++) {
                    if (actualLines[i] !== expectedLines[i]) {
                        firstDiffLine = i + 1;
                        break;
                    }
                }
                assert.fail(
                    `${file}: output differs from golden at line ${firstDiffLine}\n` +
                    `  expected: ${JSON.stringify(expectedLines[firstDiffLine - 1] ?? '<EOF>')}\n` +
                    `  actual:   ${JSON.stringify(actualLines[firstDiffLine - 1] ?? '<EOF>')}\n` +
                    `Run: node tests/fixtures/regenerate.js  (to update golden files after intentional changes)`
                );
            }
        });
    }
});
