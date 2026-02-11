import * as vscode from 'vscode';
import {ErrorHandler} from '../utils/error-handler';

const diagnosticsChannel = vscode.window.createOutputChannel('Thrift Diagnostics');

/**
 * 判断是否启用诊断调试日志。
 * @returns 是否启用
 */
export function isDiagnosticsDebugEnabled(): boolean {
    return ErrorHandler.getInstance().safe(() => {
        return !!vscode.workspace.getConfiguration('thrift').get('diagnostics.debug', false);
    }, false);
}

/**
 * 输出诊断相关日志（仅在 debug 开关开启时生效）。
 * @param message 日志内容
 * @returns void
 */
export function logDiagnostics(message: string): void {
    if (!isDiagnosticsDebugEnabled()) {
        return;
    }
    diagnosticsChannel.appendLine(message);
}
