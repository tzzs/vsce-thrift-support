import * as vscode from 'vscode';
import { ThriftDefinitionProvider } from './definitionProvider';

export class ThriftHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        try {
            // Reuse definition resolution to find the symbol being hovered
            const defProvider = new ThriftDefinitionProvider();
            const def = await defProvider.provideDefinition(document, position, token);
            const loc = this.normalizeDefinition(def);
            if (!loc) {
                return undefined;
            }

            const targetDoc = await vscode.workspace.openTextDocument(loc.uri);
            const defLineIndex = loc.range.start.line;
            const lines = targetDoc.getText().split('\n');

            // Extract the definition line and preceding doc comments
            const defLine = lines[defLineIndex] ?? '';
            const docLines = this.extractLeadingDocComments(lines, defLineIndex);

            if (!defLine.trim() && docLines.length === 0) {
                return undefined;
            }

            const md = new vscode.MarkdownString();
            const signature = defLine.trim();
            if (signature) {
                md.appendCodeblock(signature, 'thrift');
            }

            if (docLines.length > 0) {
                md.appendMarkdown('\n');
                md.appendMarkdown(docLines.join('\n'));
            }

            return new vscode.Hover(md);
        } catch {
            return undefined;
        }
    }

    private normalizeDefinition(def: vscode.Definition | undefined): vscode.Location | undefined {
        if (!def) return undefined;
        if (Array.isArray(def)) {
            if (def.length === 0) return undefined;
            // Recursively normalize the first entry
            return this.normalizeDefinition(def[0] as any);
        }
        // def can be a Location or a LocationLink
        if ('uri' in def && 'range' in def) {
            return def as vscode.Location;
        }
        if ('targetUri' in def && 'targetRange' in def) {
            const link = def as vscode.LocationLink;
            return new vscode.Location(link.targetUri, link.targetRange);
        }
        return undefined;
    }

    private extractLeadingDocComments(lines: string[], defLineIndex: number): string[] {
        const results: string[] = [];
        let i = defLineIndex - 1;
        if (i < 0) return results;

        const trim = (s: string) => s.replace(/\s+$/,'');

        // Allow up to one blank line between the definition and its doc comments
        let blanks = 0;
        while (i >= 0 && trim(lines[i] || '') === '' && blanks < 1) {
            blanks++;
            i--;
        }
        if (i < 0) return results;

        // Handle block comments ending right above the definition (possibly after one blank line)
        if (/\*\//.test(lines[i])) {
            const block: string[] = [];
            while (i >= 0) {
                const t = lines[i];
                block.push(t);
                if (/\/\*/.test(t)) {
                    break;
                }
                i--;
            }
            block.reverse();
            const cleaned = this.cleanBlockComment(block);
            results.push(...cleaned);
            return results;
        }

        // Handle consecutive line comments (// ...)
        if (/^\s*\/\//.test(lines[i])) {
            const group: string[] = [];
            while (i >= 0 && /^\s*\/\//.test(lines[i])) {
                group.push(lines[i]);
                i--;
            }
            group.reverse();
            const cleaned = group.map(s => s.replace(/^\s*\/\/\s?/, ''));
            results.push(...cleaned);
            return results;
        }

        return results;
    }

    private cleanBlockComment(blockLines: string[]): string[] {
        // Normalize /** ... */ and /* ... */ styles to plain markdown lines
        const out: string[] = [];
        for (let idx = 0; idx < blockLines.length; idx++) {
            let line = blockLines[idx];
            // Remove comment delimiters
            line = line.replace(/^\s*\/\*\*?\s?/, '');
            line = line.replace(/\*\/\s*$/, '');
            // Trim leading '* ' commonly used in JSDoc-style blocks
            line = line.replace(/^\s*\*\s?/, '');
            out.push(line);
        }
        // Trim trailing/leading empty lines
        while (out.length && out[0].trim() === '') out.shift();
        while (out.length && out[out.length - 1].trim() === '') out.pop();
        return out;
    }
}