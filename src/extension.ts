import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { ThriftFormattingProvider } from './formatter';
import { ThriftDefinitionProvider } from './definitionProvider';
import { ThriftHoverProvider } from './hoverProvider';

export function activate(context: ExtensionContext) {
    console.log('Thrift Support extension is now active!');

    // Register formatting provider
    const formattingProvider = new ThriftFormattingProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('thrift', formattingProvider)
    ); 
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider('thrift', formattingProvider)
    );

    // Register definition provider for go-to-definition
    const definitionProvider = new ThriftDefinitionProvider();
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('thrift', definitionProvider)
    );

    // Register hover provider for showing symbol documentation on hover
    const hoverProvider = new ThriftHoverProvider();
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('thrift', hoverProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.format.document', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'thrift') {
                await vscode.commands.executeCommand('editor.action.formatDocument');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.format.selection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'thrift') {
                await vscode.commands.executeCommand('editor.action.formatSelection');
            }
        })
    );
}

export function deactivate() {
    console.log('Thrift Support extension is now deactivated!');
}