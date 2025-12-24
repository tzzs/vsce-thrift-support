const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return test thrift files
        if (pattern.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, 'tests', 'test-files', 'main.thrift')},
                {fsPath: path.join(__dirname, 'tests', 'test-files', 'shared.thrift')}
            ];
        }
        return [];
    },
    openTextDocument: async (uri) => {
        // Read actual file content
        const content = fs.readFileSync(uri.fsPath, 'utf-8');
        const lines = content.split('\n');

        return {
            getText: () => content,
            uri: uri,
            lineAt: (line) => ({text: lines[line] || ''}),
            getWordRangeAtPosition: (position) => {
                const lineText = lines[position.line] || '';
                const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
                let match;
                while ((match = wordRegex.exec(lineText)) !== null) {
                    if (position.character >= match.index && position.character <= match.index + match[0].length) {
                        return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                    }
                }
                return null;
            }
        };
    }
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

async function debugReferences() {
    console.log('=== Simple References Debug ===\n');

    const provider = new ThriftReferencesProvider();

    // 读取真实的测试文件
    const mainFilePath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
    const mainContent = fs.readFileSync(mainFilePath, 'utf-8');

    console.log('Main file content:');
    console.log(mainContent);
    console.log('\n' + '='.repeat(50) + '\n');

    // 创建模拟文档
    const document = {
        uri: {fsPath: mainFilePath},
        getText: () => mainContent,
        getWordRangeAtPosition: (position, regex) => {
            console.log(`\n--- Getting word range at position [${position.line}, ${position.character}] ---`);
            const lines = mainContent.split('\n');
            const lineText = lines[position.line] || '';
            // 如果提供了正则表达式，则使用它；否则使用默认的单词边界匹配
            const wordRegex = regex || /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            return null;
        }
    };

    // 定位到 "User" 结构体定义的位置 (第4行，第7个字符)
    const position = new mockVscode.Position(4, 7);

    // 验证一下实际获取到的单词是什么
    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
        const lines = mainContent.split('\n');
        const lineText = lines[wordRange.start.line];
        const word = lineText.substring(wordRange.start.character, wordRange.end.character);
        console.log(`Extracted word: "${word}"`);
    } else {
        console.log('No word range found');
    }

    try {
        console.log('\n--- Calling provideReferences to find User references ---');
        const references = await provider.provideReferences(document, position, {includeDeclaration: true}, {isCancellationRequested: false});
        console.log('Total references found:', references.length);
        console.log('References:', references);

        // 详细显示每个引用的位置
        if (references.length > 0) {
            references.forEach((ref, index) => {
                console.log(`  Reference ${index + 1}: File ${ref.uri.fsPath}, Position [${ref.range.start.line}, ${ref.range.start.character}] - [${ref.range.end.line}, ${ref.range.end.character}]`);
            });
        }
    } catch (error) {
        console.error('provideReferences error:', error);
        console.error('Error stack:', error.stack);
    }
}

debugReferences().catch(console.error);