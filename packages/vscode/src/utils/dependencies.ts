import {CacheManager, config} from '@tanzz/thrift-core';
import {ErrorHandler} from '@tanzz/thrift-core';
import {IncrementalTracker} from './incremental-tracker';
import {ThriftFileWatcher} from './file-watcher';
import {createPerformanceMonitor, PerformanceMonitor} from '../performance-monitor';
import {IncrementalParserManager} from './incremental-parser';
import {MemoryMonitor} from '@tanzz/thrift-core';
import {WorkspaceIndex} from '../indexing/workspace-index';

export interface CoreDependencies {
    cacheManager: CacheManager;
    errorHandler: ErrorHandler;
    fileWatcher: ThriftFileWatcher;
    incrementalTracker: IncrementalTracker;
    performanceMonitor: PerformanceMonitor;
    incrementalParserManager: IncrementalParserManager;
    memoryMonitor: MemoryMonitor;
    workspaceIndex: WorkspaceIndex;
}

export function createCoreDependencies(): CoreDependencies {
    const errorHandler = new ErrorHandler();
    const fileWatcher = new ThriftFileWatcher();
    const workspaceIndex = new WorkspaceIndex({
        createWatcher: (invalidate) => fileWatcher.createWatcherWithEvents(config.filePatterns.thrift, {
            onCreate: invalidate,
            onChange: invalidate,
            onDelete: invalidate
        })
    });

    return {
        cacheManager: new CacheManager(),
        errorHandler,
        fileWatcher,
        incrementalTracker: IncrementalTracker.getInstance(),
        performanceMonitor: createPerformanceMonitor({errorHandler}),
        incrementalParserManager: new IncrementalParserManager(),
        memoryMonitor: MemoryMonitor.getInstance(),
        workspaceIndex
    };
}
