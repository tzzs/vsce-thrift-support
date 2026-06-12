import * as vscode from 'vscode';

interface IncludeLine {
    index: number;
    text: string;
    indent: string;
    kind: 'include' | 'cpp_include';
    quote: string;
    path: string;
    suffix: string;
}

export interface WholeDocumentEdit {
    range: vscode.Range;
    newText: string;
}

const INCLUDE_LINE_PATTERN = /^(\s*)(include|cpp_include)\s+(["'])([^"']+)\3(.*)$/;

export function buildOrganizeIncludesEdit(document: vscode.TextDocument): WholeDocumentEdit | undefined {
    const originalText = document.getText();
    const lines = originalText.split('\n');
    const organizedLines = lines.slice();
    let changed = false;

    for (const block of collectIncludeBlocks(lines)) {
        const sorted = block
            .slice()
            .sort((a, b) => compareIncludeLines(a, b));

        for (let i = 0; i < block.length; i++) {
            if (block[i].text !== sorted[i].text) {
                changed = true;
            }
            organizedLines[block[i].index] = sorted[i].text;
        }
    }

    if (!changed) {
        return undefined;
    }
    return {
        range: fullDocumentRange(document),
        newText: organizedLines.join('\n')
    };
}

export function buildRemoveUnusedIncludesEdit(document: vscode.TextDocument): WholeDocumentEdit | undefined {
    const originalText = document.getText();
    const lines = originalText.split('\n');
    const includeLines = lines
        .map((line, index) => parseIncludeLine(line, index))
        .filter((include): include is IncludeLine => include !== undefined && include.kind === 'include');

    if (includeLines.length === 0) {
        return undefined;
    }

    const contentWithoutIncludes = lines
        .filter((_, index) => !includeLines.some(include => include.index === index))
        .join('\n');
    const unusedIndexes = new Set<number>();
    for (const include of includeLines) {
        const alias = inferIncludeAlias(include.path);
        if (alias.length === 0) {
            continue;
        }
        const usagePattern = new RegExp(`\\b${escapeRegExp(alias)}\\.`, 'm');
        if (!usagePattern.test(contentWithoutIncludes)) {
            unusedIndexes.add(include.index);
        }
    }

    if (unusedIndexes.size === 0) {
        return undefined;
    }

    const nextText = lines
        .filter((_, index) => !unusedIndexes.has(index))
        .join('\n');

    return {
        range: fullDocumentRange(document),
        newText: nextText
    };
}

export function registerIncludeOrganizerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.organizeIncludes', async () => {
            await applyIncludeEdit(buildOrganizeIncludesEdit);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.removeUnusedIncludes', async () => {
            await applyIncludeEdit(buildRemoveUnusedIncludesEdit);
        })
    );
}

function collectIncludeBlocks(lines: string[]): IncludeLine[][] {
    const blocks: IncludeLine[][] = [];
    let current: IncludeLine[] = [];

    lines.forEach((line, index) => {
        const include = parseIncludeLine(line, index);
        if (include === undefined) {
            if (current.length > 0) {
                blocks.push(current);
                current = [];
            }
            return;
        }
        current.push(include);
    });

    if (current.length > 0) {
        blocks.push(current);
    }
    return blocks;
}

function parseIncludeLine(line: string, index: number): IncludeLine | undefined {
    const match = INCLUDE_LINE_PATTERN.exec(line);
    if (!match) {
        return undefined;
    }
    return {
        index,
        text: line,
        indent: match[1],
        kind: match[2] as 'include' | 'cpp_include',
        quote: match[3],
        path: match[4],
        suffix: match[5]
    };
}

function compareIncludeLines(a: IncludeLine, b: IncludeLine): number {
    if (a.kind !== b.kind) {
        return a.kind === 'include' ? -1 : 1;
    }
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) {
        return pathCompare;
    }
    return a.text.localeCompare(b.text);
}

function inferIncludeAlias(includePath: string): string {
    const lastSegment = includePath.split(/[\\/]/).pop() ?? includePath;
    return lastSegment.replace(/\.thrift$/i, '');
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
    const lastLine = Math.max(0, document.lineCount - 1);
    const lastLineText = document.lineAt(lastLine).text;
    return new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(lastLine, lastLineText.length)
    );
}

async function applyIncludeEdit(
    buildEdit: (document: vscode.TextDocument) => WholeDocumentEdit | undefined
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'thrift') {
        return;
    }
    const edit = buildEdit(editor.document);
    if (edit === undefined) {
        return;
    }
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(editor.document.uri, edit.range, edit.newText);
    await vscode.workspace.applyEdit(workspaceEdit);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
