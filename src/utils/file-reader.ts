import * as vscode from 'vscode';

/**
 * 读取 Thrift 文件内容：优先使用已打开的文档，避免重复 IO。
 */
export async function readThriftFile(uri: vscode.Uri): Promise<string> {
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (openDoc) {
        return openDoc.getText();
    }

    const content = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(content);
}
