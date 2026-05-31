import * as vscode from 'vscode';

/**
 * 读取 Thrift 文件内容：优先使用已打开的文档，避免重复 IO。
 */
export async function readThriftFile(uri: vscode.Uri): Promise<string | undefined> {
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (openDoc) {
        return openDoc.getText();
    }

    try {
        const content = await vscode.workspace.fs.readFile(uri);
        if (content === undefined) {
            return undefined;
        }
        return new TextDecoder('utf-8').decode(content);
    } catch {
        return undefined;
    }
}
