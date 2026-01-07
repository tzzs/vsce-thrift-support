import * as vscode from 'vscode';
import { CoreDependencies } from '../utils/dependencies';
import { registerFormattingCommands } from './formatting';
import { registerRefactoringCommands } from './refactoring';
import { registerPerformanceCommands } from './performance';

export function registerCommands(context: vscode.ExtensionContext, deps: CoreDependencies) {
    registerFormattingCommands(context);
    registerRefactoringCommands(context);
    registerPerformanceCommands(context, deps);
}
