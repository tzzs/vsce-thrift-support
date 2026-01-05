import { CacheManager } from './cache-manager';
import { ErrorHandler } from './error-handler';
import { IncrementalTracker } from './incremental-tracker';
import { ThriftFileWatcher } from './file-watcher';
import { createPerformanceMonitor, PerformanceMonitor } from '../performance-monitor';

export interface CoreDependencies {
    cacheManager: CacheManager;
    errorHandler: ErrorHandler;
    fileWatcher: ThriftFileWatcher;
    incrementalTracker: IncrementalTracker;
    performanceMonitor: PerformanceMonitor;
}

export function createCoreDependencies(): CoreDependencies {
    const errorHandler = new ErrorHandler();
    return {
        cacheManager: new CacheManager(),
        errorHandler,
        fileWatcher: new ThriftFileWatcher(),
        incrementalTracker: new IncrementalTracker(),
        performanceMonitor: createPerformanceMonitor({ errorHandler })
    };
}
