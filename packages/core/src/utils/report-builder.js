"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMb = exports.ReportBuilder = void 0;
class ReportBuilder {
    lines = [];
    add(line = '') {
        this.lines.push(line);
    }
    addLines(lines) {
        this.lines.push(...lines);
    }
    toString() {
        return this.lines.join('\n');
    }
}
exports.ReportBuilder = ReportBuilder;
function formatMb(bytes, decimals = 2) {
    return `${(bytes / 1024 / 1024).toFixed(decimals)} MB`;
}
exports.formatMb = formatMb;
//# sourceMappingURL=report-builder.js.map