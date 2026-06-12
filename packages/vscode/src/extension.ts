import * as vscode from 'vscode';
import {ErrorHandler} from '@tanzz/thrift-core';
import {createCoreDependencies} from './utils/dependencies';
import {registerProviders} from './setup';
import {registerCommands} from './commands';
import {MemoryMonitor} from '@tanzz/thrift-core';

/**
 * 扩展入口，注册所有能力与命令。
 * @param context 扩展上下文
 */
export async function activate(context: vscode.ExtensionContext) {
    const deps = createCoreDependencies();
    const errorHandler = deps.errorHandler;
    errorHandler.handleInfo('Thrift Support extension is now active!', {
        component: 'Extension',
        operation: 'activate'
    });
    context.subscriptions.push(deps.workspaceIndex);
    if (vscode.workspace.isTrusted === false) {
        errorHandler.handleInfo('Workspace index refresh skipped in Restricted Mode', {
            component: 'Extension',
            operation: 'refreshWorkspaceIndex'
        });
    } else {
        await refreshWorkspaceIndex(deps.workspaceIndex, errorHandler);
    }
    if (typeof vscode.workspace.onDidGrantWorkspaceTrust === 'function') {
        context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
            void refreshWorkspaceIndex(deps.workspaceIndex, errorHandler);
        }));
    }

    // 初始化内存管理系统
    initializeMemoryManagement(context, errorHandler);

    registerProviders(context, deps);
    registerCommands(context, deps);
}

async function refreshWorkspaceIndex(
    workspaceIndex: {refresh(): Promise<void>},
    errorHandler: ErrorHandler
): Promise<void> {
    try {
        await workspaceIndex.refresh();
    } catch (error) {
        errorHandler.handleError(error, {
            component: 'Extension',
            operation: 'refreshWorkspaceIndex'
        });
    }
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
