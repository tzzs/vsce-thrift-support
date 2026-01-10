const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {ThriftFormatter} = require('../../../out/formatter/index.js');

describe('service-doc-comments', () => {
    it('should indent service doc comments correctly', () => {
        const filePath = path.join(__dirname, '..', '..', 'test-files/example.thrift');
        const content = fs.readFileSync(filePath, 'utf8');

        const formatter = new ThriftFormatter();
        const options = {
            insertSpaces: true,
            indentSize: 2
        };

        const formattedContent = formatter.format(content, options);
        const lines = formattedContent.split('\n');

        let inUserService = false;
        let serviceBraceCount = 0;
        const errors = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
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

                    let expectedIndent = 2;
                    if (trimmed.startsWith('*') && !trimmed.startsWith('/**')) {
                        expectedIndent = 3;
                    }

                    if (indent !== expectedIndent) {
                        errors.push({
                            line: lineNum,
                            expected: expectedIndent,
                            actual: indent,
                            content: line
                        });
                    }
                }
            }
        }

        assert.strictEqual(errors.length, 0, `Found ${errors.length} doc comment indentation errors: ${JSON.stringify(errors)}`);
    });
});