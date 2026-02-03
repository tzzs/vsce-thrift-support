import * as vscode from 'vscode';
import {CoreDependencies} from '../utils/dependencies';

export function registerPerformanceCommands(context: vscode.ExtensionContext, deps: CoreDependencies) {
    const {performanceMonitor, memoryMonitor} = deps;

    // Register performance monitoring commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.showPerformanceReport', () => {
            performanceMonitor.showPerformanceReport();
        })
    );

    // Add command to clear performance data
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.clearPerformanceData', () => {
            performanceMonitor.clearMetrics();
            vscode.window.showInformationMessage('Thrift Support: Performance metrics cleared');
        })
    );

    // Add command to show memory usage report
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.showMemoryReport', () => {
            const report = memoryMonitor.getMemoryReport();
            const doc = vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            }).then(doc => {
                vscode.window.showTextDocument(doc, {preview: true});
            });
        })
    );

    // Add command to force garbage collection (when available)
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.forceGarbageCollection', () => {
            memoryMonitor.forceGarbageCollection();
            vscode.window.showInformationMessage('Thrift Support: Garbage collection forced');
        })
    );
}
