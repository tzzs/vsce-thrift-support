import {CacheManager} from '@tanzz/thrift-core';
import {ErrorHandler} from '@tanzz/thrift-core';
import {IncrementalTracker} from './incremental-tracker';
import {ThriftFileWatcher} from './file-watcher';
import {createPerformanceMonitor, PerformanceMonitor} from '../performance-monitor';
import {IncrementalParserManager} from './incremental-parser';
import {MemoryMonitor} from '@tanzz/thrift-core';

export interface CoreDependencies {
    cacheManager: CacheManager;
    errorHandler: ErrorHandler;
    fileWatcher: ThriftFileWatcher;
    incrementalTracker: IncrementalTracker;
    performanceMonitor: PerformanceMonitor;
    incrementalParserManager: IncrementalParserManager;
    memoryMonitor: MemoryMonitor;
}

export function createCoreDependencies(): CoreDependencies {
    const errorHandler = new ErrorHandler();
    return {
        cacheManager: new CacheManager(),
        errorHandler,
        fileWatcher: new ThriftFileWatcher(),
        incrementalTracker: IncrementalTracker.getInstance(),
        performanceMonitor: createPerformanceMonitor({errorHandler}),
        incrementalParserManager: new IncrementalParserManager(),
        memoryMonitor: MemoryMonitor.getInstance()
    };
}
