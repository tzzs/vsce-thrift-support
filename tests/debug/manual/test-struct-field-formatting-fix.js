const assert = require('assert');
const vscode = require('vscode');
const path = require('path');

/**
 * 测试struct字段格式化的5个问题修复：
 * 1. 类型没有正常识别（类型和变量名之间没有空格）
 * 2. 变量名没有对齐
 * 3. annotation没有对齐
 * 4. 逗号没有紧跟代码（中间有多余的空格）
 * 5. 注释没有对齐
 */
suite('Struct Field Formatting Fixes Test Suite', function () {
    this.timeout(10000);

    test('Fix 1: Type recognition with no space between type and name', async () => {
        const testInput = `struct User {
  1: required UserId id ,
  6: optional list<string>tags,
  7: optional map<string, string>metadata,
}`;

        const expectedOutput = `struct User {
  1:  required UserId                id,
  6:  optional list<string>          tags,
  7:  optional map<string, string>   metadata,
}`;

        const doc = await vscode.workspace.openTextDocument({
            content: testInput,
            language: 'thrift'
        });

        const edits = await vscode.commands.executeCommand(
            'vscode.executeFormatDocumentProvider',
            doc.uri,
            { insertSpaces: true, tabSize: 2 }
        );

        if (edits && edits.length > 0) {
            const formatted = edits[0].newText;
            console.log('\n=== Fix 1: Type Recognition Test ===');
            console.log('Input:\n', testInput);
            console.log('\nFormatted:\n', formatted);
            console.log('\nExpected:\n', expectedOutput);

            // 检查关键点：
            // 1. list<string>tags 应该被格式化为 list<string> tags（有空格）
            assert.ok(formatted.includes('list<string>'), 'Should preserve list<string> type');
            assert.ok(formatted.includes('tags'), 'Should have tags field name');
            assert.ok(!formatted.includes('list<string>tags'), 'Should separate type and name with space');

            // 2. map<string, string>metadata 同理
            assert.ok(formatted.includes('map<string, string>'), 'Should preserve map type');
            assert.ok(formatted.includes('metadata'), 'Should have metadata field name');
            assert.ok(!formatted.includes('map<string, string>metadata'), 'Should separate type and name with space');
        } else {
            assert.fail('No formatting edits returned');
        }
    });

    test('Fix 2-5: Variable name, annotation, comma, and comment alignment', async () => {
        const testInput = `struct User {
  1: required UserId id ,
  2:  required string    name              (go.tag    ='json:"name"'),
  3:  optional Email email                 (go.tag    ="xx:\\"len($)>0\\""),
  4:  optional i32                 age               ,
  5:  optional Status                      status     = Status.ACTIVE,
  6:  optional list<string>tags                      ,
  7:  optional map<string, string>metadata           ,
}`;

        const doc = await vscode.workspace.openTextDocument({
            content: testInput,
            language: 'thrift'
        });

        const edits = await vscode.commands.executeCommand(
            'vscode.executeFormatDocumentProvider',
            doc.uri,
            { insertSpaces: true, tabSize: 2 }
        );

        if (edits && edits.length > 0) {
            const formatted = edits[0].newText;
            console.log('\n=== Fix 2-5: Alignment Test ===');
            console.log('Input:\n', testInput);
            console.log('\nFormatted:\n', formatted);

            const lines = formatted.split('\n').filter(l => l.trim() && !l.trim().startsWith('struct') && !l.trim().startsWith('}'));

            // Fix 4: 检查逗号处理（逗号应该紧跟在变量名或默认值后，不应该有空格）
            lines.forEach((line, idx) => {
                console.log(`Line ${idx}: "${line}"`);
                // 检查逗号前没有多余空格（如 "id ," 应该变成 "id,"）
                assert.ok(!/ ,/.test(line), `Line ${idx} should not have space before comma: ${line}`);
            });

            // Fix 2: 检查变量名对齐（所有字段名应该在同一列）
            const namePositions = lines.map(line => {
                // 查找字段名的位置（在类型之后，逗号之前）
                const match = line.match(/\s+([a-zA-Z_][a-zA-Z0-9_]*),/);
                if (match) {
                    return line.indexOf(match[1]);
                }
                return -1;
            }).filter(pos => pos !== -1);

            if (namePositions.length > 1) {
                const firstPos = namePositions[0];
                const allAligned = namePositions.every(pos => pos === firstPos);
                console.log('Name positions:', namePositions);
                assert.ok(allAligned, 'All field names should be aligned at the same column');
            }

            // Fix 3: 检查annotation对齐
            const annotationLines = lines.filter(line => line.includes('(go.tag'));
            if (annotationLines.length > 1) {
                const annoPositions = annotationLines.map(line => line.indexOf('(go.tag'));
                console.log('Annotation positions:', annoPositions);
                const firstAnnoPos = annoPositions[0];
                const allAnnoAligned = annoPositions.every(pos => pos === firstAnnoPos);
                assert.ok(allAnnoAligned, 'All annotations should be aligned at the same column');
            }

        } else {
            assert.fail('No formatting edits returned');
        }
    });

    test('Full struct formatting with comments', async () => {
        const testInput = `struct User {
  1: required UserId id , // 用户唯一标识
  2:  required string    name              (go.tag    ='json:"name"'),  // 用户姓名
  3:  optional Email email                 (go.tag    ="xx:\\"len($)>0\\""), // 邮箱地址
  4:  optional i32                 age               ,                  // 年龄
  5:  optional Status                      status     = Status.ACTIVE,  // 用户状态
  6:  optional list<string>tags                      ,                  // 用户标签列表
  7:  optional map<string, string>metadata           ,                  // 用户元数据
}`;

        const doc = await vscode.workspace.openTextDocument({
            content: testInput,
            language: 'thrift'
        });

        const edits = await vscode.commands.executeCommand(
            'vscode.executeFormatDocumentProvider',
            doc.uri,
            { insertSpaces: true, tabSize: 2 }
        );

        if (edits && edits.length > 0) {
            const formatted = edits[0].newText;
            console.log('\n=== Full Struct Test with Comments ===');
            console.log('Input:\n', testInput);
            console.log('\nFormatted:\n', formatted);

            const lines = formatted.split('\n').filter(l => l.trim() && !l.trim().startsWith('struct') && !l.trim().startsWith('}'));

            // Fix 5: 检查注释对齐
            const commentLines = lines.filter(line => line.includes('//'));
            if (commentLines.length > 1) {
                const commentPositions = commentLines.map(line => line.indexOf('//'));
                console.log('Comment positions:', commentPositions);
                const firstCommentPos = commentPositions[0];
                const allCommentsAligned = commentPositions.every(pos => pos === firstCommentPos);
                assert.ok(allCommentsAligned, 'All comments should be aligned at the same column');
            }

            // 检查所有行都被正确解析（没有字段丢失）
            assert.strictEqual(lines.length, 7, 'Should have 7 field lines');

            // 检查类型识别正确
            assert.ok(formatted.includes('list<string>'), 'Should have list<string> type');
            assert.ok(formatted.includes('map<string, string>'), 'Should have map<string, string> type');

        } else {
            assert.fail('No formatting edits returned');
        }
    });
});
