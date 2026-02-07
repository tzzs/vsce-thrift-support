import * as vscode from 'vscode';
import * as path from 'path';
import {ErrorHandler} from '../utils/error-handler';
import {createLocation} from '../utils/vscode-utils';

const decoder = new TextDecoder('utf-8');

const primitiveTypes = new Set([
    'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid',
    'list', 'set', 'map', 'void'
]);

export function getWordRangeAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Range | undefined {
    const line = document.lineAt(position.line);
    const text = line.text;

    const includeMatch = text.match(/^(\s*)include\s+["']([^"']+)["']/);
    if (includeMatch) {
        const includeStart = text.indexOf('include');
        const quoteStart = text.indexOf('"') !== -1 ? text.indexOf('"') : text.indexOf('\'');
        const quoteEnd = text.lastIndexOf('"') !== -1 ? text.lastIndexOf('"') : text.lastIndexOf('\'');

        if (position.character >= includeStart && position.character <= quoteEnd) {
            if (position.character >= includeStart && position.character < includeStart + 7) {
                return new vscode.Range(position.line, includeStart, position.line, includeStart + 7);
            }
            if (position.character >= quoteStart && position.character <= quoteEnd) {
                return new vscode.Range(position.line, quoteStart, position.line, quoteEnd + 1);
            }
        }
    }

    const directRange = document.getWordRangeAtPosition(position);
    if (directRange) {
        return directRange;
    }

    // Fallback: try adjacent lines if no word found at current position
    // This improves robustness in edge cases (e.g., empty lines, boundaries)
    const offsets = [1, -1, 2, -2];
    for (const offset of offsets) {
        const targetLine = position.line + offset;
        if (targetLine < 0) {
            continue;
        }
        if (typeof document.lineCount === 'number' && targetLine >= document.lineCount) {
            continue;
        }
        try {
            const targetLineText = document.lineAt(targetLine);
            const charPosition = Math.min(
                Math.max(position.character, 0),
                Math.max(0, (targetLineText.text?.length ?? 0) - 1)
            );
            const fallbackRange = document.getWordRangeAtPosition(
                new vscode.Position(targetLine, charPosition)
            );
            if (fallbackRange) {
                return fallbackRange;
            }
        } catch {
            continue;
        }
    }

    return undefined;
}

export async function checkIncludeStatement(
    document: vscode.TextDocument,
    position: vscode.Position,
    errorHandler: ErrorHandler
): Promise<vscode.Location | undefined> {
    const line = document.lineAt(position.line);
    const lineText = line.text.trim();
    const includeMatch = lineText.match(/^include\s+["']([^"']+)["']/);
    if (!includeMatch) {
        return undefined;
    }

    const includePath = includeMatch[1];
    const documentDir = path.dirname(document.uri.fsPath);
    const fullLineText = line.text;
    const quoteStart = fullLineText.indexOf('"') !== -1 ? fullLineText.indexOf('"') : fullLineText.indexOf('\'');
    const quoteEnd = fullLineText.lastIndexOf('"') !== -1 ? fullLineText.lastIndexOf('"') : fullLineText.lastIndexOf('\'');

    if (position.character >= quoteStart && position.character <= quoteEnd) {
        const resolvedPath = await resolveModulePath(includePath, documentDir);
        if (resolvedPath) {
            try {
                const uri = vscode.Uri.file(resolvedPath);
                await vscode.workspace.fs.stat(uri);
                return createLocation(uri, new vscode.Range(0, 0, 0, 0));
            } catch (_error) {
                errorHandler.handleWarning(`Include file not found: ${includePath}`, {
                    component: 'ThriftDefinitionProvider',
                    operation: 'resolveIncludePath',
                    filePath: document.uri.fsPath,
                    additionalInfo: {includePath}
                });
            }
        }
    }

    return undefined;
}

export async function findIncludeForNamespace(
    document: vscode.TextDocument,
    namespace: string
): Promise<vscode.Location | undefined> {
    const text = document.getText();
    const lines = text.split('\n');
    const documentDir = path.dirname(document.uri.fsPath);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const includeMatch = line.match(/^include\s+["']([^"']+)["']/);
        if (!includeMatch) {
            continue;
        }
        const includePath = includeMatch[1];
        const fileName = path.basename(includePath, '.thrift');
        if (fileName === namespace) {
            return createLocation(document.uri, new vscode.Range(i, 0, i, 0));
        }
        const resolvedPath = await resolveModulePath(includePath, documentDir);
        if (!resolvedPath) {
            continue;
        }
        try {
            const uri = vscode.Uri.file(resolvedPath);
            const content = await vscode.workspace.fs.readFile(uri);
            const includeText = decoder.decode(content);
            if (fileDeclaresNamespace(includeText, namespace)) {
                return createLocation(document.uri, new vscode.Range(i, 0, i, 0));
            }
        } catch {
            continue;
        }
    }

    return undefined;
}

export async function resolveModulePath(includePath: string, documentDir: string): Promise<string | undefined> {
    const candidates: string[] = [];
    if (path.isAbsolute(includePath)) {
        candidates.push(path.normalize(includePath));
    } else if (includePath.startsWith('./') || includePath.startsWith('../')) {
        candidates.push(path.resolve(documentDir, includePath));
    } else {
        candidates.push(path.resolve(documentDir, includePath));
    }

    const workspaceDir = path.resolve(documentDir, '..');
    const baseName = path.basename(includePath);
    candidates.push(path.resolve(workspaceDir, includePath));
    candidates.push(path.resolve(workspaceDir, 'test-files', baseName));

    for (const candidate of candidates) {
        try {
            const normalized = path.normalize(candidate);
            const uri = vscode.Uri.file(normalized);
            await vscode.workspace.fs.stat(uri);
            return normalized;
        } catch {
            continue;
        }
    }

    return candidates.length > 0 ? path.normalize(candidates[0]) : undefined;
}

export function isPrimitiveType(word: string): boolean {
    return primitiveTypes.has(word);
}

export function fileDeclaresNamespace(text: string, namespace: string): boolean {
    const escaped = namespace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const namespaceRegex = new RegExp(`^\\s*namespace\\s+[A-Za-z0-9_.]+\\s+${escaped}\\b`, 'm');
    return namespaceRegex.test(text);
}

export function getIncludedFiles(
    document: vscode.TextDocument,
    errorHandler: ErrorHandler
): vscode.Uri[] {
    const text = document.getText();
    const lines = text.split('\n');
    const includedFiles: vscode.Uri[] = [];
    const documentDir = path.dirname(document.uri.fsPath);

    for (const line of lines) {
        const trimmedLine = line.trim();
        const includeMatch = trimmedLine.match(/^include\s+["']([^"']+)["']/);
        if (!includeMatch) {
            continue;
        }
        const includePath = includeMatch[1];
        let fullPath: string;
        if (path.isAbsolute(includePath)) {
            fullPath = includePath;
        } else {
            fullPath = path.resolve(documentDir, includePath);
        }
        try {
            const uri = vscode.Uri.file(fullPath);
            includedFiles.push(uri);
        } catch (_error) {
            errorHandler.handleWarning(`Invalid include path: ${includePath}`, {
                component: 'ThriftDefinitionProvider',
                operation: 'getIncludedFiles',
                filePath: document.uri.fsPath,
                additionalInfo: {includePath}
            });
        }
    }

    return includedFiles;
}
