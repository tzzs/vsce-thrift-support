import * as vscode from 'vscode';

export function registerFormattingCommands(context: vscode.ExtensionContext) {
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
