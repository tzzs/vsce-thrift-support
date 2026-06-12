import * as vscode from 'vscode';
import {CoreDependencies} from '../utils/dependencies';
import {registerFormattingCommands} from './formatting';
import {registerRefactoringCommands} from './refactoring';
import {registerPerformanceCommands} from './performance';
import {registerIncludeOrganizerCommands} from '../include-organizer';

export function registerCommands(context: vscode.ExtensionContext, deps: CoreDependencies) {
    registerFormattingCommands(context);
    registerIncludeOrganizerCommands(context);
    registerRefactoringCommands(context);
    registerPerformanceCommands(context, deps);
}
