const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function readText(filePath) {
    return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function readJson(filePath) {
    return JSON.parse(readText(filePath));
}

describe('runtime baseline', () => {
    it('keeps Node version files and package engines aligned to Node 24', () => {
        assert.strictEqual(readText('.nvmrc').trim(), '24.16.0');
        assert.strictEqual(readText('.node-version').trim(), '24.16.0');
        assert.strictEqual(readJson('package.json').engines.node, '>=24 <25');
        assert.strictEqual(readJson('packages/cli/package.json').engines.node, '>=24 <25');
    });

    it('keeps CI and publishing workflows on Node 24', () => {
        const ci = readText('.github/workflows/ci.yml');
        const publish = readText('.github/workflows/publish.yml');

        assert.match(ci, /node-version:\s*24\.x/);
        assert.match(publish, /node-version:\s*24\.x/);
        assert.doesNotMatch(`${ci}\n${publish}`, /22\.18\.0/);
    });

    it('documents the same runtime baseline in developer docs', () => {
        const docs = [
            readText('DEVELOPMENT.md'),
            readText('AGENTS.md')
        ].join('\n');

        assert.match(docs, /24\.16\.0/);
        assert.match(docs, /Node 24|Node\.js: 24/);
        assert.doesNotMatch(docs, /Node 22\.18\.0|22\.18\.0 required/);
        assert.match(docs, /undici/);
    });
});
