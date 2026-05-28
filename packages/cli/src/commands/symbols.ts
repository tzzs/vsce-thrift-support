/**
 * symbols 命令：列出文件中定义的所有符号。
 * 参考 document-symbol-provider.ts:89-213 的符号提取逻辑。
 */
import * as fs from 'fs';
import {ThriftParser, nodes} from '@tanzz/thrift-core';
import type {ParsedArgs} from '../args';
import {formatSymbolsText, SymbolInfo} from '../output';

export function runSymbols(files: string[], args: ParsedArgs): number {
    if (files.length === 0) {
        process.stderr.write('Error: No files specified.\n');
        return 2;
    }

    const allResults: {file: string; symbols: SymbolInfo[]}[] = [];

    for (const filePath of files) {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            process.stderr.write(`Error: Cannot read "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }

        try {
            const ast = new ThriftParser(content).parse();
            const symbols = extractSymbols(ast, args.flat);

            if (args.json) {
                allResults.push({file: filePath, symbols});
            } else {
                if (files.length > 1) {
                    process.stdout.write(`\n${filePath}:\n`);
                }
                const text = formatSymbolsText(symbols);
                if (text) {process.stdout.write(text + '\n');}
            }
        } catch (error) {
            process.stderr.write(`Error: Symbol extraction failed for "${filePath}": ${error instanceof Error ? error.message : String(error)}\n`);
            return 3;
        }
    }

    if (args.json) {
        if (files.length === 1 && allResults.length === 1) {
            process.stdout.write(JSON.stringify(allResults[0].symbols, null, 2) + '\n');
        } else {
            process.stdout.write(JSON.stringify(allResults, null, 2) + '\n');
        }
    }

    return 0;
}

function extractSymbols(ast: nodes.ThriftDocument, flat: boolean): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const node of ast.body) {
        const sym = nodeToSymbol(node, flat);
        if (sym) {
            if (flat && sym.children) {
                // Flatten: push parent, then children at top level
                const children = sym.children;
                sym.children = undefined;
                symbols.push(sym);
                symbols.push(...children);
            } else {
                symbols.push(sym);
            }
        }
    }

    return symbols;
}

function nodeToSymbol(node: nodes.ThriftNode, flat: boolean): SymbolInfo | null {
    const line = node.range.start.line + 1;

    switch (node.type) {
        case nodes.ThriftNodeType.Namespace: {
            const ns = node;
            return {
                name: ns.namespace,
                kind: 'namespace',
                line,
                detail: `(${ns.scope})`,
            };
        }
        case nodes.ThriftNodeType.Include: {
            const inc = node;
            return {
                name: inc.path,
                kind: 'include',
                line,
            };
        }
        case nodes.ThriftNodeType.Const: {
            const c = node;
            return {
                name: c.name ?? '',
                kind: 'const',
                line,
                detail: c.valueType,
            };
        }
        case nodes.ThriftNodeType.Typedef: {
            const td = node;
            return {
                name: td.name ?? '',
                kind: 'typedef',
                line,
                detail: td.aliasType,
            };
        }
        case nodes.ThriftNodeType.Enum: {
            const en = node;
            const children = en.members.map(m => ({
                name: m.name ?? '',
                kind: 'enum-member',
                line: m.range.start.line + 1,
                detail: m.initializer !== undefined ? `= ${m.initializer}` : undefined,
            }));
            return {
                name: en.name ?? '',
                kind: en.isSenum === true ? 'senum' : 'enum',
                line,
                children: flat ? children : (children.length > 0 ? children : undefined),
            };
        }
        case nodes.ThriftNodeType.Struct:
        case nodes.ThriftNodeType.Union:
        case nodes.ThriftNodeType.Exception: {
            const st = node;
            const kind = node.type === nodes.ThriftNodeType.Struct ? 'struct'
                : node.type === nodes.ThriftNodeType.Union ? 'union'
                : 'exception';
            const children = st.fields.map(f => ({
                name: f.name ?? '',
                kind: 'field',
                line: f.range.start.line + 1,
                detail: `${f.id}: ${f.requiredness ?? ''} ${f.fieldType}`.trim(),
            }));
            return {
                name: st.name ?? '',
                kind,
                line,
                children: flat ? children : (children.length > 0 ? children : undefined),
            };
        }
        case nodes.ThriftNodeType.Service: {
            const svc = node;
            const children = svc.functions.map(fn => ({
                name: fn.name ?? '',
                kind: 'function',
                line: fn.range.start.line + 1,
                detail: `${fn.oneway ? 'oneway ' : ''}${fn.returnType}(${fn.arguments.map(a => `${a.fieldType} ${a.name ?? ''}`).join(', ')})`,
            }));
            return {
                name: svc.name ?? '',
                kind: 'service',
                line,
                detail: svc.extends !== null && svc.extends !== undefined ? `extends ${svc.extends}` : undefined,
                children: flat ? children : (children.length > 0 ? children : undefined),
            };
        }
        case nodes.ThriftNodeType.Interaction: {
            const inter = node;
            const children = inter.functions.map(fn => ({
                name: fn.name ?? '',
                kind: 'function',
                line: fn.range.start.line + 1,
                detail: `${fn.returnType}(${fn.arguments.map(a => `${a.fieldType} ${a.name ?? ''}`).join(', ')})`,
            }));
            return {
                name: inter.name ?? '',
                kind: 'interaction',
                line,
                children: flat ? children : (children.length > 0 ? children : undefined),
            };
        }
        default:
            return null;
    }
}
