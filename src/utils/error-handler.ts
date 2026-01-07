import * as vscode from 'vscode';

/**
 * 错误上下文信息。
 */
export interface ErrorContext {
    component: string;
    operation: string;
    filePath?: string;
    additionalInfo?: Record<string, any>;
}

/**
 * ErrorHandler：统一错误与告警处理。
 */
export class ErrorHandler {
    private static instance: ErrorHandler;

    /**
     * 获取单例实例。
     * @returns {ErrorHandler} ErrorHandler 单例
     */
    static getInstance(): ErrorHandler {
        if (!this.instance) {
            this.instance = new ErrorHandler();
        }
        return this.instance;
    }

    /**
     * 处理错误并记录日志。
     * @param error 捕获的错误对象（Error | unknown）
     * @param context 错误上下文（组件、操作、文件路径等）
     */
    handleError(error: unknown, context: ErrorContext): void {
        const errorMessage = this.getErrorMessage(error);
        const logMessage = this.formatLogMessage(errorMessage, context, 'error');

        // 记录到控制台
        console.error(logMessage);

        // 如果是用户操作相关的错误，显示通知
        if (this.shouldShowNotification(context)) {
            this.showErrorNotification(errorMessage, context);
        }

        // 记录详细错误信息到输出通道（如果可用）
        this.logToOutputChannel(error, context);
    }

    /**
     * 处理警告并记录日志。
     * @param message 警告消息
     * @param context 错误上下文
     */
    handleWarning(message: string, context: ErrorContext): void {
        const logMessage = this.formatLogMessage(message, context, 'warning');

        // 记录到控制台
        console.warn(logMessage);

        // 记录到输出通道（如果可用）
        this.logToOutputChannel(new Error(message), context, 'warning');
    }

    /**
     * 记录信息级日志，保持输出风格一致。
     * @param message日志消息
     * @param context 错误上下文
     */
    handleInfo(message: string, context: ErrorContext): void {
        const logMessage = this.formatLogMessage(message, context, 'info');
        console.log(logMessage);
        this.logToOutputChannel(message, context, 'info');
    }

    /**
     * 包装异步函数，自动处理错误。
     * @param fn 目标异步函数
     * @param context 错误上下文
     * @param fallbackValue 出错时的回退值（可选）
     * @returns 函数执行结果，或在出错时返回 fallbackValue（如果提供），否则抛出错误
     */
    async wrapAsync<T>(
        fn: () => Promise<T>,
        context: ErrorContext,
        fallbackValue?: T
    ): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            this.handleError(error, context);
            if (fallbackValue !== undefined) {
                return fallbackValue;
            }
            throw error;
        }
    }

    /**
     * 包装同步函数，自动处理错误。
     * @param fn 目标同步函数
     * @param context 错误上下文
     * @param fallbackValue 出错时的回退值（可选）
     * @returns 函数执行结果，或在出错时返回 fallbackValue（如果提供），否则抛出错误
     */
    wrapSync<T>(fn: () => T, context: ErrorContext, fallbackValue?: T): T {
        try {
            return fn();
        } catch (error) {
            this.handleError(error, context);
            if (fallbackValue !== undefined) {
                return fallbackValue;
            }
            throw error;
        }
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'Unknown error';
    }

    private formatLogMessage(message: string, context: ErrorContext, level: 'error' | 'warning' | 'info' = 'error'): string {
        const verb = level === 'info' ? ':' : ' failed:';
        const baseMessage = `[${context.component}] ${context.operation}${verb} ${message}`;
        const fileInfo = context.filePath ? ` (file: ${context.filePath})` : '';
        const additionalInfo = context.additionalInfo
            ? ` | Additional: ${JSON.stringify(context.additionalInfo)}`
            : '';
        return `${baseMessage}${fileInfo}${additionalInfo}`;
    }

    private shouldShowNotification(context: ErrorContext): boolean {
        // 只对用户直接触发的操作显示通知
        return context.operation.includes('provide') ||
            context.operation.includes('register') ||
            context.operation.includes('activate');
    }

    private showErrorNotification(message: string, context: ErrorContext): void {
        const shortMessage = `[Thrift Support] ${context.operation} failed: ${message}`;
        vscode.window.showErrorMessage(shortMessage, 'Details').then(selection => {
            if (selection === 'Details') {
                const details = this.formatLogMessage(message, context);
                vscode.window.showErrorMessage(details);
            }
        });
    }

    private logToOutputChannel(
        error: unknown,
        context: ErrorContext,
        level: 'error' | 'warning' | 'info' = 'error'
    ): void {
        try {
            // 尝试获取输出通道（如果已创建）
            const channel = vscode.window.createOutputChannel('Thrift Support');
            const timestamp = new Date().toISOString();
            const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
            const logEntry = `[${timestamp}] ${level.toUpperCase()} ${context.component}.${context.operation}\n${errorMessage}\n`;

            channel.appendLine(logEntry);

            // 只在需要时显示输出通道
            if (level === 'error') {
                channel.show(true);
            }
        } catch {
            // 如果输出通道创建失败，忽略
        }
    }
}
