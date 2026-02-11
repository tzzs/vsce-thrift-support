import {ThriftFormattingOptions} from '../interfaces.types';
import {LineRange} from '../utils/line-range';
import {ErrorHandler} from '../utils/error-handler';
import {CoreDependencies} from '../utils/dependencies';
import {formatThriftContent} from './formatter-core';

/**
 * ThriftFormatter：将 Thrift 源码格式化为统一风格。
 */
export class ThriftFormatter {
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 格式化指定文本内容。
     */
    public format(content: string, options?: ThriftFormattingOptions, dirtyRange?: LineRange): string {
        try {
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
