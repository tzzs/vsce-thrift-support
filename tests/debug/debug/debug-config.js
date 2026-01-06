const fs = require('fs');
const assert = require('assert');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    TextEdit: {replace: (range, text) => ({range, newText: text})},
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        getConfiguration: (section) => {
            console.log('getConfiguration called with section:', section);
            if (section === 'thrift.format') {
                return {
                    get: (key, defaultValue) => {
                        console.log('Config get called with key:', key, 'defaultValue:', defaultValue);
                        const config = {
                            'alignTypes': true,
                            'alignFieldNames': true,
                            'trailingComma': 'add',
                            'indentSize': 4,
                            'insertSpaces': true,
                            'alignNames': true,
                            'alignAssignments': true,
                            'alignStructDefaults': false,
                            'alignAnnotations': true,
                            'alignComments': true,
                            'alignEnumEquals': true,
                            'alignEnumValues': true,
                            'maxLineLength': 100,
                            'collectionStyle': 'preserve'
                        };
                        const value = config[key] !== undefined ? config[key] : defaultValue;
                        console.log('Returning value:', value);
                        return value;
                    }
                };
            }
            return {
                get: (key, defaultValue) => defaultValue,
            };
        }
    }
});
installVscodeMock(vscode);


// Mock require('vscode') inside formatter
const {ThriftFormatter} = require('../out/formatter/index.js');

async function debugConfig() {
    console.log('=== 调试配置问题 ===');
    
    const formatter = new ThriftFormatter();
    
    const input = `struct User{1:i32 id;2:string name;}`;
    console.log('输入:', input);
    
    // Test with explicit options
    const options = {
        trailingComma: 'add',
        alignTypes: true,
        alignFieldNames: true,
        insertSpaces: true,
        indentSize: 4,
        alignNames: true,
        alignAssignments: true,
        alignStructDefaults: false,
        alignAnnotations: true,
        alignComments: true,
        alignEnumEquals: true,
        alignEnumValues: true,
        maxLineLength: 100,
        collectionStyle: 'preserve'
    };
    
    console.log('使用显式选项:', JSON.stringify(options, null, 2));
    const result1 = formatter.format(input, options);
    console.log('显式选项结果:');
    console.log(result1);
    
    // Test with default options (should use workspace config)
    console.log('\n使用默认选项:');
    const result2 = formatter.format(input);
    console.log('默认选项结果:');
    console.log(result2);
}

debugConfig().then(() => {
    Module._load = originalLoad;
    console.log('调试完成');
}).catch(error => {
    console.error('调试失败:', error);
    Module._load = originalLoad;
});
