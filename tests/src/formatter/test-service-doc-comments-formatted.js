const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {ThriftFormatter} = require('../../../out/formatter/index.js');

describe('service-doc-comments-formatted', () => {
    it('should properly format and indent service doc comments', () => {
        const filePath = path.join(__dirname, '..', '..', 'test-files/example.thrift');
        const content = fs.readFileSync(filePath, 'utf8');

        const formatter = new ThriftFormatter();
        const options = {
            insertSpaces: true,
            indentSize: 2
        };

        const formatted = formatter.format(content, options);
        const formattedLines = formatted.split('\n');

        let inUserService = false;
        let serviceBraceCount = 0;
        const errors = [];

        for (let i = 0; i < formattedLines.length; i++) {
            const line = formattedLines[i];
            const lineNum = i + 1;

            if (line.includes('service UserService')) {
                inUserService = true;
                serviceBraceCount = 0;
                continue;
            }

            if (inUserService) {
                if (line.includes('{')) serviceBraceCount++;
                if (line.includes('}')) {
                    serviceBraceCount--;
                    if (serviceBraceCount === 0) {
                        inUserService = false;
                        continue;
                    }
                }

                const trimmed = line.trim();
                if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
                    const match = line.match(/^(\s*)/);
                    const indent = match ? match[1].length : 0;

                    if (trimmed.startsWith('/**')) {
                        if (indent !== 2) {
                            errors.push({line: lineNum, expected: 2, actual: indent, content: line});
                        }
                    } else {
                        if (indent !== 3) {
                            errors.push({line: lineNum, expected: 3, actual: indent, content: line});
                        }
                    }
                }
            }
        }

        assert.strictEqual(errors.length, 0, `Found ${errors.length} doc comment indentation errors after formatting: ${JSON.stringify(errors)}`);
    });
});