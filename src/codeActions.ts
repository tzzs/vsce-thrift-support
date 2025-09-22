import * as vscode from 'vscode';
import * as path from 'path';

export class ThriftRefactorCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.RefactorExtract,
        vscode.CodeActionKind.RefactorMove,
        vscode.CodeActionKind.QuickFix,
    ];

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[] | undefined> {
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

        const position = (range as vscode.Selection).active ?? range.start;
        const lineText = document.lineAt(position.line).text;

        // 1) QuickFix: insert include for namespaced reference Foo.Bar when missing
        const nsRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
        let m: RegExpExecArray | null;
        const includeSet = this.collectExistingIncludes(document);
        const createdNs = new Set<string>();
        while ((m = nsRegex.exec(lineText)) !== null) {
            const ns = m[1];
            const fileName = `${ns}.thrift`;
            if (!includeSet.has(fileName) && !createdNs.has(ns)) {
                const fix = new vscode.CodeAction(`Insert include "${fileName}"`, vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                const insertLine = this.computeIncludeInsertLine(document);
                fix.edit.insert(document.uri, new vscode.Position(insertLine, 0), `include "${fileName}"\n`);
                fix.isPreferred = true;
                actions.push(fix);
                createdNs.add(ns);
            }
        }

        // 2) QuickFix: for unqualified identifier provide include choices when multiple workspace definitions exist
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (wordRange) {
            const word = document.getText(wordRange);
            if (word && !lineText.includes(`${word}.`)) {
                try {
                    const candidates = await this.findWorkspaceDefinitions(word);
                    // Create include actions per unique file
                    const uniqueFiles = new Map<string, { fileName: string, uri: vscode.Uri }>();
                    for (const c of candidates) {
                        const fname = path.basename(c.uri.fsPath);
                        uniqueFiles.set(fname, { fileName: fname, uri: c.uri });
                    }
                    for (const { fileName } of uniqueFiles.values()) {
                        if (!includeSet.has(fileName)) {
                            const fix = new vscode.CodeAction(`Insert include "${fileName}"`, vscode.CodeActionKind.QuickFix);
                            fix.edit = new vscode.WorkspaceEdit();
                            const insertLine = this.computeIncludeInsertLine(document);
                            fix.edit.insert(document.uri, new vscode.Position(insertLine, 0), `include "${fileName}"\n`);
                            actions.push(fix);
                        }
                    }
                } catch {
                    // ignore search errors
                }
            }
        }

        return actions;
    }

    private collectExistingIncludes(document: vscode.TextDocument): Set<string> {
        const set = new Set<string>();
        const text = document.getText();
        const lines = text.split('\n');
        for (const l of lines) {
            const mm = l.trim().match(/^include\s+["']([^"']+)["']/);
            if (mm) set.add(mm[1]);
        }
        return set;
    }

    private computeIncludeInsertLine(document: vscode.TextDocument): number {
        const text = document.getText();
        const lines = text.split('\n');
        let insertLine = 0;
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*(include\s+["'].+["']|namespace\s+)/.test(lines[i])) {
                insertLine = i + 1;
            }
        }
        return insertLine;
    }

    private async findWorkspaceDefinitions(typeName: string): Promise<Array<{ uri: vscode.Uri }>> {
        const results: Array<{ uri: vscode.Uri }> = [];
        const files = await vscode.workspace.findFiles('**/*.thrift');
        const defRegex = new RegExp(`^\\s*(struct|enum|service|typedef)\\s+${typeName}(\\b|\\s|<|$)`, 'm');
        for (const file of files) {
            try {
                const doc = await vscode.workspace.openTextDocument(file);
                if (defRegex.test(doc.getText())) {
                    results.push({ uri: file });
                }
            } catch {
                // ignore
            }
        }
        return results;
    }
}