import * as vscode from 'vscode';

/**
 * 判断是否启用诊断调试日志。
 * @returns 是否启用
 */
export function isDiagnosticsDebugEnabled(): boolean {
    try {
        return !!vscode.workspace.getConfiguration('thrift').get('diagnostics.debug', false);
    } catch {
        return false;
    }
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
    console.log(message);
}
