import * as vscode from 'vscode';
import {CoreDependencies} from '../utils/dependencies';

export function registerPerformanceCommands(context: vscode.ExtensionContext, deps: CoreDependencies) {
    const {performanceMonitor} = deps;

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
}
