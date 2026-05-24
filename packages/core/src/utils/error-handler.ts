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

    private aggregations = new Map<string, {count: number; lastMessage: string; component: string; operation: string}>();

    static getInstance(): ErrorHandler {
        this.instance ??= new ErrorHandler();
        return this.instance;
    }

    handleError(error: unknown, context: ErrorContext): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.errorStats.total++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
        this.incrementCounter(this.errorStats.byOperation, context.operation);

        const aggKey = `${context.component}:${context.operation}:${errorMessage}`;
        const existing = this.aggregations.get(aggKey);
        if (existing) {
            existing.count++;
        } else {
            this.aggregations.set(aggKey, {count: 1, lastMessage: errorMessage, component: context.component, operation: context.operation});
        }

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

    wrapSync<T>(fn: () => T, context: ErrorContext, fallbackValue?: T): T | undefined {
        const hasFallback = arguments.length >= 3;
        try {
            return fn();
        } catch (error) {
            this.handleError(error, context);
            if (hasFallback) {
                return fallbackValue;
            }
            throw error;
        }
    }

    async wrapAsync<T>(fn: () => Promise<T>, context: ErrorContext, fallbackValue?: T): Promise<T | undefined> {
        const hasFallback = arguments.length >= 3;
        try {
            return await fn();
        } catch (error) {
            this.handleError(error, context);
            if (hasFallback) {
                return fallbackValue;
            }
            throw error;
        }
    }

    getStats() {
        return {...this.errorStats};
    }

    /** Backward-compatible alias for getStats(). */
    getErrorStats() {
        return this.getStats();
    }

    /** Returns the error aggregation map keyed by component:operation:message. */
    getErrorAggregations() {
        return new Map(this.aggregations);
    }

    /** Resets all stats and aggregations. */
    resetStats(): void {
        this.errorStats.total = 0;
        this.errorStats.warnings = 0;
        this.errorStats.infos = 0;
        this.errorStats.byComponent.clear();
        this.errorStats.byOperation.clear();
        this.aggregations.clear();
    }

    private incrementCounter(map: Map<string, number>, key: string): void {
        map.set(key, (map.get(key) ?? 0) + 1);
    }
}
