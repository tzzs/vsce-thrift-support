const assert = require('assert');
const {ReportBuilder, formatMb} = require('../../../out/utils/report-builder.js');

describe('report-builder', () => {
    it('should build reports with lines', () => {
        const report = new ReportBuilder();
        report.add('line1');
        report.add();
        report.add('line2');
        assert.strictEqual(report.toString(), 'line1\n\nline2');
    });

    it('should format megabytes', () => {
        assert.strictEqual(formatMb(1024 * 1024), '1.00 MB');
        assert.strictEqual(formatMb(1024 * 1024, 1), '1.0 MB');
    });
});
