import * as vscode from 'vscode';
import { ErrorHandler } from './utils/error-handler';
import { createCoreDependencies } from './utils/dependencies';
import { registerProviders } from './setup';
import { registerCommands } from './commands';

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

    registerProviders(context, deps);
    registerCommands(context, deps);
}

/**
 * 扩展停用时清理资源。
 */
export function deactivate() {
    const errorHandler = new ErrorHandler();
    errorHandler.handleInfo('Thrift Support extension is now deactivated!', {
        component: 'Extension',
        operation: 'deactivate'
    });
}
