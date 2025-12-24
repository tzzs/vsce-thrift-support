import * as vscode from 'vscode';

export class FileContentReader {
    private static instance: FileContentReader;

    static getInstance(): FileContentReader {
        if (!this.instance) {
            this.instance = new FileContentReader();
        }
        return this.instance;
    }

    /**
     * 读取文件内容，优先从打开的文档中获取
     */
    async readFile(uri: vscode.Uri): Promise<string> {
        // 首先检查是否在已打开的文档中
        const openDoc = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === uri.toString()
        );

        if (openDoc) {
            return openDoc.getText();
        }

        // 如果文档未打开，从文件系统读取
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder('utf-8').decode(content);
        } catch (error) {
            throw new Error(`Failed to read file ${uri.fsPath}: ${error}`);
        }
    }

    /**
     * 批量读取多个文件
     */
    async readFiles(uris: vscode.Uri[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();

        const promises = uris.map(async uri => {
            try {
                const content = await this.readFile(uri);
                results.set(uri.toString(), content);
            } catch (error) {
                console.warn(`Failed to read file ${uri.fsPath}:`, error);
            }
        });

        await Promise.all(promises);
        return results;
    }

    /**
     * 检查文件是否存在
     */
    async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取文件状态信息
     */
    async getFileStat(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
        try {
            return await vscode.workspace.fs.stat(uri);
        } catch {
            return undefined;
        }
    }
}