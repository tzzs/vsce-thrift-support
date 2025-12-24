"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileContentReader = void 0;
const vscode = __importStar(require("vscode"));
class FileContentReader {
    static instance;
    static getInstance() {
        if (!this.instance) {
            this.instance = new FileContentReader();
        }
        return this.instance;
    }
    async readFile(uri) {
        const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (openDoc) {
            return openDoc.getText();
        }
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder('utf-8').decode(content);
        }
        catch (error) {
            throw new Error(`Failed to read file ${uri.fsPath}: ${error}`);
        }
    }
    async readFiles(uris) {
        const results = new Map();
        const promises = uris.map(async (uri) => {
            try {
                const content = await this.readFile(uri);
                results.set(uri.toString(), content);
            }
            catch (error) {
                console.warn(`Failed to read file ${uri.fsPath}:`, error);
            }
        });
        await Promise.all(promises);
        return results;
    }
    async fileExists(uri) {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        }
        catch {
            return false;
        }
    }
    async getFileStat(uri) {
        try {
            return await vscode.workspace.fs.stat(uri);
        }
        catch {
            return undefined;
        }
    }
}
exports.FileContentReader = FileContentReader;
//# sourceMappingURL=fileReader.js.map