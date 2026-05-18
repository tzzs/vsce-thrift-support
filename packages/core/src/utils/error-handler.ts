/**
 * 错误上下文信息。
 */
export interface ErrorContext {
    component: string;
    operation: string;
    filePath?: string;
    additionalInfo?: Record<string, unknown>;
}

/**
 * ErrorHandler：统一错误与告警处理（core 版本，不依赖 vscode）。
 * 在 CLI/core 环境中使用 console 输出替代 vscode.window 通知。
 */
export class ErrorHandler {
    private static instance: ErrorHandler;

    private errorStats = {
        total: 0,
        warnings: 0,
        infos: 0,
        byComponent: new Map<string, number>(),
        byOperation: new Map<string, number>()
    };

    static getInstance(): ErrorHandler {
        this.instance ??= new ErrorHandler();
        return this.instance;
    }

    handleError(error: unknown, context: ErrorContext): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.errorStats.total++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
        this.incrementCounter(this.errorStats.byOperation, context.operation);

        // eslint-disable-next-line no-console
        console.error(`[${context.component}:${context.operation}] ${errorMessage}`);
    }

    handleWarning(message: string, context: ErrorContext): void {
        this.errorStats.warnings++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
    }

    handleInfo(message: string, context: ErrorContext): void {
        this.errorStats.infos++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
    }

    safe<T>(fn: () => T, fallbackValue: T): T {
        try {
            return fn();
        } catch {
            return fallbackValue;
        }
    }

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

    getStats() {
        return {...this.errorStats};
    }

    private incrementCounter(map: Map<string, number>, key: string): void {
        map.set(key, (map.get(key) ?? 0) + 1);
    }
}
