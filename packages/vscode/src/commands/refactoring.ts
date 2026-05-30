import * as vscode from 'vscode';
import * as path from 'path';
import {buildExtractTypeEdits, inferExtractTypeTarget, inferMoveTypeTarget, RangeLike} from '@tanzz/thrift-core';

export function registerRefactoringCommands(context: vscode.ExtensionContext) {
    // Refactor: extract type definition
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.refactor.extractType', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'thrift') {
                return;
            }
            const doc = editor.document;
            const sel = editor.selection;
            const text = doc.getText();
            const target = inferExtractTypeTarget(text, sel.active, sel.isEmpty ? undefined : sel);
            if (target === undefined) {
                return;
            }

            const newTypeName = await vscode.window.showInputBox({
                prompt: 'New type name',
                value: 'ExtractedType'
            });
            if (newTypeName === undefined) {
                return;
            }

            const extractEdits = buildExtractTypeEdits(target, newTypeName);
            const edit = new vscode.WorkspaceEdit();
            edit.insert(doc.uri, toVsPosition(extractEdits.insertPosition), extractEdits.insertText);
            edit.replace(doc.uri, toVsRange(extractEdits.replaceRange), extractEdits.replaceText);

            await vscode.workspace.applyEdit(edit);
        })
    );

    // Refactor: move type to another file
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.refactor.moveType', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'thrift') {
                return;
            }
            const doc = editor.document;
            const sel = editor.selection;
            const target = inferMoveTypeTarget(doc.getText(), sel.active);
            if (target === undefined) {
                return;
            }

            const defaultFileName = `${target.typeName}.thrift`;
            const targetName = await vscode.window.showInputBox({
                prompt: 'Target .thrift file name',
                value: defaultFileName
            });
            if (targetName === undefined) {
                return;
            }

            const folder = vscode.Uri.file(path.dirname(doc.uri.fsPath));
            const targetUri = vscode.Uri.file(path.join(folder.fsPath, targetName));

            const edit = new vscode.WorkspaceEdit();
            // Guard: avoid silently overwriting an existing file
            try {
                await vscode.workspace.fs.stat(targetUri);
                await vscode.window.showWarningMessage(
                    `Target file "${targetName}" already exists. Move cancelled to avoid overwriting.`
                );
                return;
            } catch {
                // file does not exist, safe to proceed
            }
            // Ensure include line exists
            const includeLine = `include "${targetName}"`;
            const docText = doc.getText();
            if (!new RegExp(`^\\s*include\\s+['"]${escapeRegExp(targetName)}['"]`, 'm').test(docText)) {
                edit.insert(doc.uri, new vscode.Position(0, 0), includeLine + '\n');
            }
            // Remove original block
            edit.delete(doc.uri, deletionRangeForMove(doc, target.range));
            // Create new file and insert block
            edit.createFile(targetUri, {overwrite: true});
            edit.insert(targetUri, new vscode.Position(0, 0), target.typeText + '\n');

            await vscode.workspace.applyEdit(edit);
        })
    );
}

function toVsPosition(position: {line: number; character: number}): vscode.Position {
    return new vscode.Position(position.line, position.character);
}

function toVsRange(range: RangeLike): vscode.Range {
    return new vscode.Range(toVsPosition(range.start), toVsPosition(range.end));
}

function deletionRangeForMove(document: vscode.TextDocument, range: RangeLike): vscode.Range {
    const nextLine = range.end.line + 1;
    if (nextLine < document.lineCount) {
        return new vscode.Range(range.start.line, 0, nextLine, 0);
    }
    return new vscode.Range(range.start.line, 0, range.end.line, range.end.character);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
