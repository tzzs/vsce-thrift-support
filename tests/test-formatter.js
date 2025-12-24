// 独立的格式化器测试，不依赖VSCode

class TestThriftFormatter {
    formatThriftCode(text, options) {
        const lines = text.split('\n');
        const formattedLines = [];
        let indentLevel = 0;
        let inStruct = false;
        let structFields = [];

        console.log('开始处理', lines.length, '行代码');

        for (let i = 0; i < lines.length; i++) {
            let originalLine = lines[i];
            let line = originalLine.trim();

            console.log(`第${i + 1}行: "${originalLine}" -> "${line}"`);

            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                console.log('  -> 跳过空行或注释');
                continue;
            }

            // Handle struct/union/exception/service definitions
            if (this.isStructStart(line)) {
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inStruct = true;
                structFields = [];
                console.log('  -> 检测到struct开始，inStruct =', inStruct);
                continue;
            }

            // Handle closing braces
            if (line === '}' || line === '},') {
                if (inStruct && structFields.length > 0) {
                    console.log('  -> 处理累积的', structFields.length, '个字段');
                    // Format accumulated struct fields
                    const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                    formattedLines.push(...formattedFields);
                    structFields = [];
                }
                indentLevel--;
                inStruct = false;
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                console.log('  -> 检测到struct结束，inStruct =', inStruct);
                continue;
            }

            // Handle struct fields - use original line to preserve indentation for parsing
            if (inStruct && this.isStructField(originalLine)) {
                console.log('  -> 检测到struct字段');
                const fieldInfo = this.parseStructField(originalLine);
                if (fieldInfo) {
                    console.log('  -> 解析字段成功:', fieldInfo);
                    structFields.push(fieldInfo);
                    continue;
                } else {
                    console.log('  -> 解析字段失败');
                }
            } else if (inStruct) {
                console.log('  -> 在struct中但不是字段:', 'isStructField =', this.isStructField(originalLine));
            }

            // Regular lines
            formattedLines.push(this.getIndent(indentLevel, options) + line);
            console.log('  -> 作为普通行处理');
        }

        // Handle any remaining struct fields
        if (structFields.length > 0) {
            console.log('处理剩余的', structFields.length, '个字段');
            const formattedFields = this.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        return formattedLines.join('\n');
    }

    isStructStart(line) {
        const result = /^(struct|union|exception|service|enum)\s+\w+\s*\{?$/.test(line) ||
            /^(struct|union|exception|service|enum)\s+\w+.*\{$/.test(line);
        console.log(`    isStructStart("${line}") = ${result}`);
        return result;
    }

    isStructField(line) {
        const result = /^\s*\d+:\s*(required|optional)?\s*\w+\s+\w+/.test(line);
        console.log(`    isStructField("${line}") = ${result}`);
        return result;
    }

    parseStructField(line) {
        // Parse field: 1: required string name, // comment
        // Handle complex types like list<string>, map<string, string>
        const match = line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)([\w<>,\s]+?)\s+(\w+)(.*)$/);
        if (match) {
            const prefix = match[1];
            const type = match[2].trim();
            const name = match[3];
            const suffix = match[4].trim();
            const commentMatch = suffix.match(/^([^/]*)(\/.*)$/);
            const fieldSuffix = commentMatch ? commentMatch[1].trim() : suffix;
            const comment = commentMatch ? commentMatch[2] : '';

            const result = {
                line: line,
                type: type,
                name: name,
                comment: comment
            };
            console.log(`    parseStructField("${line}") = `, result);
            return result;
        }
        console.log(`    parseStructField("${line}") = null`);
        return null;
    }

    formatStructFields(fields, options, indentLevel) {
        console.log('formatStructFields: 处理', fields.length, '个字段');

        if (!options.alignTypes && !options.alignFieldNames && !options.alignComments) {
            return fields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        // Calculate max widths for alignment
        let maxTypeWidth = 0;
        let maxNameWidth = 0;

        const parsedFields = fields.map(field => {
            const match = field.line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(\w+)\s+(\w+)(.*)$/);
            if (match) {
                const prefix = match[1];
                const type = match[2];
                const name = match[3];
                const remainder = match[4].trim();

                // Parse suffix and comment
                const commentMatch = remainder.match(/^([^/]*)(\/.*)$/);
                const suffix = commentMatch ? commentMatch[1].trim() : remainder;
                const comment = commentMatch ? commentMatch[2] : '';

                maxTypeWidth = Math.max(maxTypeWidth, type.length);
                maxNameWidth = Math.max(maxNameWidth, name.length);

                return {prefix, type, name, suffix, comment};
            }
            return null;
        }).filter(f => f !== null);

        console.log('maxTypeWidth:', maxTypeWidth, 'maxNameWidth:', maxNameWidth);

        // Format fields with alignment
        return parsedFields.map(field => {
            if (!field) {
                return '';
            }

            let formattedLine = this.getIndent(indentLevel, options) + field.prefix;

            if (options.alignTypes) {
                formattedLine += field.type.padEnd(maxTypeWidth);
            } else {
                formattedLine += field.type;
            }

            formattedLine += ' ';

            if (options.alignFieldNames) {
                formattedLine += field.name.padEnd(maxNameWidth);
            } else {
                formattedLine += field.name;
            }

            // Fix spacing around equals sign
            let cleanSuffix = field.suffix;
            if (cleanSuffix.includes('=')) {
                cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
            }

            formattedLine += cleanSuffix;

            // Add trailing comma if configured
            if (options.trailingComma && !cleanSuffix.includes(',') && !cleanSuffix.includes(';')) {
                formattedLine += ',';
            }

            if (field.comment && options.alignComments) {
                // Align comments
                const targetLength = 60; // Target column for comments
                const currentLength = formattedLine.length;
                if (currentLength < targetLength) {
                    formattedLine += ' '.repeat(targetLength - currentLength);
                } else {
                    formattedLine += ' ';
                }
                formattedLine += field.comment;
            } else if (field.comment) {
                formattedLine += ' ' + field.comment;
            }

            console.log('格式化字段:', formattedLine);
            return formattedLine;
        });
    }

    getIndent(level, options) {
        const indentSize = options.indentSize || 2;
        if (options.insertSpaces) {
            return ' '.repeat(level * indentSize);
        } else {
            return '\t'.repeat(level);
        }
    }
}

// 测试代码
const formatter = new TestThriftFormatter();

const mockOptions = {
    insertSpaces: true,
    tabSize: 2,
    indentSize: 2,
    alignTypes: true,
    alignFieldNames: true,
    alignComments: true,
    trailingComma: true
};

const testCode = `struct User {
  1: required UserId     id,
  2: required string name,
  3: optional Email email,
  4: optional i32 age,
  5: optional Status status = Status.ACTIVE,
  6: optional list<string> tags,
  7: optional map<string, string> metadata,
  8: optional bool isVerified = false,
  9: optional double score = 0.0,
  10: optional binary avatar
}`;

console.log('=== 原始代码 ===');
console.log(testCode);
console.log('\n=== 开始格式化测试 ===');

const result = formatter.formatThriftCode(testCode, mockOptions);

console.log('\n=== 格式化结果 ===');
console.log(result);

if (result === testCode) {
    console.log('\n❌ 格式化没有产生任何变化');
} else {
    console.log('\n✅ 格式化成功，代码已改变');
}
