import * as vscode from 'vscode';
import {ErrorHandler} from './utils/error-handler';
import {createCoreDependencies} from './utils/dependencies';
import {registerProviders} from './setup';
import {registerCommands} from './commands';
import {SmartMemoryMonitor, MemoryMonitor} from './utils/memory-monitor';
import {MemoryAwareCacheManager, CacheManager} from './utils/cache-manager';
import {performanceMonitor} from './optimized-performance-monitor';

/**
 * 扩展入口，注册所有能力与命令。
 * @param context 扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    const deps = createCoreDependencies();
    const errorHandler = deps.errorHandler;
    errorHandler.handleInfo('Thrift Support extension is now active!', {
        component: 'Extension',
        operation: 'activate'
    });

    // 初始化内存管理系统
    initializeMemoryManagement(context, errorHandler);

    // 注册性能监控相关命令
    registerPerformanceCommands(context, errorHandler);

    registerProviders(context, deps);
    registerCommands(context, deps);
}

/**
 * 注册性能相关的命令
 */
function registerPerformanceCommands(context: vscode.ExtensionContext, errorHandler: ErrorHandler): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.showPerformanceReport', async () => {
            try {
                await performanceMonitor.showPerformanceReport();
            } catch (error) {
                errorHandler.handleError(error, {
                    component: 'Extension',
                    operation: 'showPerformanceReport'
                });
            }
        })
    );
}

/**
 * 初始化内存管理系统
 */
function initializeMemoryManagement(context: vscode.ExtensionContext, errorHandler: ErrorHandler): void {
    try {
        // 获取智能内存监控器实例
        const memoryMonitor = MemoryMonitor.getInstance();

        // 定期记录内存使用情况
        const memoryCheckInterval = setInterval(() => {
            memoryMonitor.recordMemoryUsage();
        }, 30000); // 每30秒检查一次

        // 注册内存相关的命令
        context.subscriptions.push(
            vscode.commands.registerCommand('thrift.showMemoryReport', () => {
                try {
                    const report = memoryMonitor.getMemoryReport();
                    const panel = vscode.window.createWebviewPanel(
                        'thriftMemoryReport',
                        'Thrift Memory Report',
                        vscode.ViewColumn.One,
                        {}
                    );
                    panel.webview.html = `<pre>${report}</pre>`;
                } catch (error) {
                    errorHandler.handleError(error, {
                        component: 'Extension',
                        operation: 'showMemoryReport'
                    });
                }
            })
        );

        // 监听内存警告事件
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('thrift.performance')) {
                    // 当性能配置改变时，可能需要调整内存策略
                    const cacheManager = CacheManager.getInstance();
                    // 根据配置可能调整动态调整因子
                }
            })
        );

        // 在扩展激活时立即记录一次内存使用情况
        memoryMonitor.recordMemoryUsage();

        // 存储清理函数以便在扩展停用时使用
        context.subscriptions.push({
            dispose: () => {
                clearInterval(memoryCheckInterval);
            }
        });

        errorHandler.handleInfo('Memory management system initialized', {
            component: 'Extension',
            operation: 'initializeMemoryManagement'
        });
    } catch (error) {
        errorHandler.handleError(error, {
            component: 'Extension',
            operation: 'initializeMemoryManagement'
        });
    }
}

/**
 * 扩展停用时清理资源。
 */
export function deactivate() {
    const errorHandler = new ErrorHandler();

    // 获取内存监控器实例并执行清理
    try {
        const memoryMonitor = MemoryMonitor.getInstance();
        memoryMonitor.forceGarbageCollection(); // 尝试强制垃圾回收
    } catch (error) {
        errorHandler.handleError(error, {
            component: 'Extension',
            operation: 'deactivate-memory-monitor'
        });
    }

    errorHandler.handleInfo('Thrift Support extension is now deactivated!', {
        component: 'Extension',
        operation: 'deactivate'
    });
}
