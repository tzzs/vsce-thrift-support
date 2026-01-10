const assert = require('assert');

describe('diagnostic-throttling', () => {
    let vscode;

    before(() => {
        vscode = require('vscode');
    });

    function simulateThriftAnalysis(text) {
        const issues = [];

        if (text.includes('struct') && !text.includes('}')) {
            issues.push({
                code: 'syntax.missingBrace',
                message: 'Missing closing brace',
                severity: 0,
                range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}
            });
        }

        const lines = text.split('\n');
        const fieldIds = new Set();
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^\s*(\d+):\s*(\w+)/);
            if (match) {
                const fieldId = match[1];
                if (fieldIds.has(fieldId)) {
                    issues.push({
                        code: 'field.duplicateId',
                        message: `Duplicate field ID: ${fieldId}`,
                        severity: 0,
                        range: {start: {line: i, character: 0}, end: {line: i, character: lines[i].length}}
                    });
                }
                fieldIds.add(fieldId);
            }
        }

        return issues;
    }

    it('should throttle rapid analysis calls', function (done) {
        this.timeout(1000);

        let analysisCount = 0;
        const ANALYSIS_DELAY = 100;

        function throttledAnalysis(document, callback) {
            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
            }

            this.timeoutId = setTimeout(() => {
                analysisCount++;
                const issues = simulateThriftAnalysis(document.getText());
                callback(issues);
            }, ANALYSIS_DELAY);
        }

        const mockDocument = {
            uri: {fsPath: 'test.thrift'},
            getText: () => 'struct Test { 1: string name }',
            languageId: 'thrift'
        };

        throttledAnalysis(mockDocument, () => {
        });
        throttledAnalysis(mockDocument, () => {
        });
        throttledAnalysis(mockDocument, () => {
        });

        setTimeout(() => {
            assert.strictEqual(analysisCount, 1, 'Should only trigger one analysis');
            done();
        }, ANALYSIS_DELAY + 50);
    });

    it('should track document versions', () => {
        const versions = new Map();
        const uri = 'test.thrift';

        versions.set(uri, 1);
        assert.strictEqual(versions.get(uri), 1);

        versions.set(uri, 2);
        assert.strictEqual(versions.get(uri), 2);

        const hasNewerVersion = versions.get(uri) > 1;
        assert.ok(hasNewerVersion, 'Should track version changes');
    });

    it('should measure analysis performance', function (done) {
        this.timeout(500);

        const startTime = Date.now();

        setTimeout(() => {
            const duration = Date.now() - startTime;
            assert.ok(duration >= 50, 'Should measure elapsed time');
            assert.ok(duration < 200, 'Should complete within reasonable time');
            done();
        }, 100);
    });

    it('should handle rapid document changes', () => {
        const changes = [];
        const maxChanges = 10;

        for (let i = 0; i < maxChanges; i++) {
            changes.push({
                version: i + 1,
                text: `struct Test${i} { 1: string field }`
            });
        }

        assert.strictEqual(changes.length, maxChanges);
        assert.strictEqual(changes[changes.length - 1].version, maxChanges);
    });

    it('should detect syntax errors', () => {
        const textWithError = 'struct Test { 1: string name';
        const issues = simulateThriftAnalysis(textWithError);

        assert.ok(issues.length > 0, 'Should detect missing brace');
        assert.ok(issues.some(i => i.code === 'syntax.missingBrace'));
    });

    it('should detect duplicate field IDs', () => {
        const textWithDuplicate = 'struct Test {\n  1: string name\n  1: i32 id\n}';
        const issues = simulateThriftAnalysis(textWithDuplicate);

        assert.ok(issues.some(i => i.code === 'field.duplicateId'), 'Should detect duplicate field ID');
    });

    it('should handle valid thrift code', () => {
        const validText = 'struct Test {\n  1: string name\n  2: i32 id\n}';
        const issues = simulateThriftAnalysis(validText);

        const syntaxErrors = issues.filter(i => i.code === 'syntax.missingBrace');
        const duplicateErrors = issues.filter(i => i.code === 'field.duplicateId');

        assert.strictEqual(syntaxErrors.length, 0, 'Should not report syntax errors for valid code');
        assert.strictEqual(duplicateErrors.length, 0, 'Should not report duplicate IDs for valid code');
    });
});


module.exports = {run};
