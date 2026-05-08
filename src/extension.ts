import * as vscode from 'vscode';
import {ErrorHandler} from './utils/error-handler';
import {createCoreDependencies} from './utils/dependencies';
import {registerProviders} from './setup';
import {registerCommands} from './commands';
import {MemoryMonitor} from './utils/memory-monitor';
import {performanceMonitor} from './performance-monitor';

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
        }, 120000); // 每2分钟检查一次

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
