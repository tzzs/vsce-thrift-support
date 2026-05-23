"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
class ErrorHandler {
    static instance;
    errorStats = {
        total: 0,
        warnings: 0,
        infos: 0,
        byComponent: new Map(),
        byOperation: new Map()
    };
    static getInstance() {
        this.instance ??= new ErrorHandler();
        return this.instance;
    }
    handleError(error, context) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.errorStats.total++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
        this.incrementCounter(this.errorStats.byOperation, context.operation);
        console.error(`[${context.component}:${context.operation}] ${errorMessage}`);
    }
    handleWarning(message, context) {
        this.errorStats.warnings++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
    }
    handleInfo(message, context) {
        this.errorStats.infos++;
        this.incrementCounter(this.errorStats.byComponent, context.component);
    }
    safe(fn, fallbackValue) {
        try {
            return fn();
        }
        catch {
            return fallbackValue;
        }
    }
    async wrapAsync(fn, context, fallbackValue) {
        try {
            return await fn();
        }
        catch (error) {
            this.handleError(error, context);
            if (fallbackValue !== undefined) {
                return fallbackValue;
            }
            throw error;
        }
    }
    getStats() {
        return { ...this.errorStats };
    }
    incrementCounter(map, key) {
        map.set(key, (map.get(key) ?? 0) + 1);
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=error-handler.js.map