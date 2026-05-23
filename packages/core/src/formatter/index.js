"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThriftFormatter = void 0;
const error_handler_1 = require("../utils/error-handler");
const formatter_core_1 = require("./formatter-core");
const chunked_format_1 = require("./chunked-format");
class ThriftFormatter {
    errorHandler;
    constructor(deps) {
        this.errorHandler = deps?.errorHandler ?? new error_handler_1.ErrorHandler();
    }
    format(content, options, dirtyRange) {
        try {
            if (dirtyRange === undefined && content.split('\n').length > chunked_format_1.CHUNK_THRESHOLD) {
                return (0, chunked_format_1.formatChunked)(content, options ?? {}, (chunk, opts) => (0, formatter_core_1.formatThriftContent)(chunk, opts));
            }
            return (0, formatter_core_1.formatThriftContent)(content, options, dirtyRange);
        }
        catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFormatter',
                operation: 'format',
                additionalInfo: { contentLength: content.length }
            });
            return content;
        }
    }
    formatThriftCode(text, options, dirtyRange) {
        return this.format(text, options, dirtyRange);
    }
}
exports.ThriftFormatter = ThriftFormatter;
//# sourceMappingURL=index.js.map