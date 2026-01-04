import { CacheManager } from './cache-manager';
import { ErrorHandler } from './error-handler';
import { IncrementalTracker } from './incremental-tracker';
import { ThriftFileWatcher } from './file-watcher';

export interface CoreDependencies {
    cacheManager: CacheManager;
    errorHandler: ErrorHandler;
    fileWatcher: ThriftFileWatcher;
    incrementalTracker: IncrementalTracker;
}

export function createCoreDependencies(): CoreDependencies {
    return {
        cacheManager: CacheManager.getInstance(),
        errorHandler: ErrorHandler.getInstance(),
        fileWatcher: ThriftFileWatcher.getInstance(),
        incrementalTracker: IncrementalTracker.getInstance()
    };
}
