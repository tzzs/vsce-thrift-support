import * as vscode from 'vscode';
import { ThriftReferencesProvider } from './referencesProvider';

export class ThriftRenameProvider implements vscode.RenameProvider {
    prepareRename(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string; }> {
        const wordRange = this.getWordRange(document, position);
        if (!wordRange) {
            return Promise.reject('No symbol to rename at cursor');
        }
        const placeholder = document.getText(wordRange);
        return { range: wordRange, placeholder };
    }

    async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit | undefined> {
        const wordRange = this.getWordRange(document, position);
        if (!wordRange) {return undefined;}
        const oldName = document.getText(wordRange);
        if (!oldName || oldName === newName) {return undefined;}

        // Use the references provider to find all occurrences
        const referencesProvider = new ThriftReferencesProvider();
        const references = await referencesProvider.provideReferences(
            document, 
            position, 
            { includeDeclaration: true }, 
            token
        );

        if (!references || references.length === 0) {
            return undefined;
        }

        const edit = new vscode.WorkspaceEdit();
        
        // Apply edits for all references
        for (const reference of references) {
            edit.replace(
                reference.uri,
                reference.range,
                newName
            );
        }
        
        return edit;
    }

    private getWordRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
        const defaultWordPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
        const line = document.lineAt(position.line).text;
        let match: RegExpExecArray | null;
        while ((match = defaultWordPattern.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return new vscode.Range(new vscode.Position(position.line, start), new vscode.Position(position.line, end));
            }
        }
        return undefined;
    }

    private escapeRegExp(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}