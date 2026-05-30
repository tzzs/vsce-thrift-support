const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');

describe('performance benchmark JSON output', function () {
    this.timeout(30000);

    it('emits categorized machine-readable benchmark results', () => {
        const script = path.join(process.cwd(), 'tests/perf/run-performance-benchmark.js');
        const result = spawnSync(process.execPath, [
            script,
            '--json',
            '--structs', '4',
            '--fields', '3',
            '--iterations', '1'
        ], {
            cwd: process.cwd(),
            encoding: 'utf8'
        });

        assert.strictEqual(result.status, 0, result.stderr);
        const payload = JSON.parse(result.stdout);
        assert.strictEqual(payload.schemaVersion, 1);
        assert.ok(Array.isArray(payload.results));
        assert.ok(payload.results.length >= 4);

        const categories = new Set(payload.results.map(entry => entry.category));
        assert.ok(categories.has('parser'));
        assert.ok(categories.has('diagnostics'));
        assert.ok(categories.has('formatter'));
        assert.ok(categories.has('workspace-index'));

        for (const entry of payload.results) {
            assert.strictEqual(typeof entry.operation, 'string');
            assert.strictEqual(typeof entry.avg, 'number');
            assert.strictEqual(typeof entry.p95, 'number');
        }
    });
});
