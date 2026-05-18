import {ThriftFormattingOptions} from '../interfaces.types';
import {LineRange} from '../utils/line-range';
import {ErrorHandler} from '../utils/error-handler';
import {formatThriftContent} from './formatter-core';
import {CHUNK_THRESHOLD, formatChunked} from './chunked-format';

/**
 * ThriftFormatter：将 Thrift 源码格式化为统一风格。
 */
export class ThriftFormatter {
    private errorHandler: ErrorHandler;

    constructor(deps?: {errorHandler?: ErrorHandler}) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 格式化指定文本内容。
     * 对超过 CHUNK_THRESHOLD 行的文件启用分块格式化以提升性能。
     */
    public format(content: string, options?: ThriftFormattingOptions, dirtyRange?: LineRange): string {
        try {
            // Chunked formatting for large files without explicit dirty range
            if (dirtyRange === undefined && content.split('\n').length > CHUNK_THRESHOLD) {
                return formatChunked(content, options ?? {} as ThriftFormattingOptions, (chunk, opts) =>
                    formatThriftContent(chunk, opts)
                );
            }
            return formatThriftContent(content, options, dirtyRange);
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFormatter',
                operation: 'format',
                additionalInfo: {contentLength: content.length}
            });
            return content;
        }
    }

    public formatThriftCode(text: string, options: ThriftFormattingOptions, dirtyRange?: LineRange): string {
        // Delegate to the existing format method
        return this.format(text, options, dirtyRange);
    }

}
