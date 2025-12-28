const { ThriftParser } = require('../out/ast/parser');

// Test cases from our debug formatter
const testCases = [
    "struct User{1:i32 id;2:string name;}",
    "struct User {\n  1: i32 id\n  2: string name\n}",
    "struct User {\n    1: required i32 id,\n    2: optional string name\n}",
    "struct User {\n    1: i32 id = 0,\n    2: string name = \"\"\n}",
    "struct User {\n    1: i32 id, // user ID\n    2: string name // user name\n}"
];

console.log('=== Testing AST Struct Field Parsing ===\n');

testCases.forEach((testCase, index) => {
    console.log(`Test Case ${index + 1}: "${testCase}"`);
    
    const ast = new ThriftParser(testCase).parse();
    const structNode = ast.body.find(node => node.type === 'Struct');
    if (!structNode) {
        console.log('  No struct parsed');
    } else {
        console.log(`  Parsed fields: ${structNode.fields.length}`);
        structNode.fields.forEach((field, idx) => {
            console.log(`    Field ${idx + 1}:`, JSON.stringify(field, null, 2));
        });
    }
    
    console.log('');
});

console.log('=== Done ===\n');
