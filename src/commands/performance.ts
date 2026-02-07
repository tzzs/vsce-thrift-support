import * as vscode from 'vscode';
import {CoreDependencies} from '../utils/dependencies';

export function registerPerformanceCommands(context: vscode.ExtensionContext, deps: CoreDependencies) {
    const {performanceMonitor, memoryMonitor} = deps;

    // Register performance monitoring commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.showPerformanceReport', async () => {
            await performanceMonitor.showPerformanceReport();
        })
    );

    // Add command to clear performance data
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.clearPerformanceData', async () => {
            performanceMonitor.clearMetrics();
            await vscode.window.showInformationMessage('Thrift Support: Performance metrics cleared');
        })
    );

    // Add command to show memory usage report
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.showMemoryReport', async () => {
            const report = memoryMonitor.getMemoryReport();
            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, {preview: true});
        })
    );

    // Add command to force garbage collection (when available)
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.forceGarbageCollection', async () => {
            memoryMonitor.forceGarbageCollection();
            await vscode.window.showInformationMessage('Thrift Support: Garbage collection forced');
        })
    );
}
