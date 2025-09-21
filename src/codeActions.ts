import * as vscode from 'vscode';

export class ThriftRefactorCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.RefactorExtract,
        vscode.CodeActionKind.RefactorMove,
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        if (document.languageId !== 'thrift') return;

        const actions: vscode.CodeAction[] = [];

        // Extract type (typedef) from selection or current token
        const extract = new vscode.CodeAction('Extract type (typedef)', vscode.CodeActionKind.RefactorExtract);
        extract.command = { command: 'thrift.refactor.extractType', title: 'Extract type (typedef)' };
        actions.push(extract);

        // Move type to another file (struct/enum/service/typedef)
        const move = new vscode.CodeAction('Move type to file...', vscode.CodeActionKind.RefactorMove);
        move.command = { command: 'thrift.refactor.moveType', title: 'Move type to file...' };
        actions.push(move);

        return actions;
    }
}