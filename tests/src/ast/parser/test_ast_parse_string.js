// Mock vscode
const {createVscodeMock, installVscodeMock} = require('../../../mock_vscode.js');
const vscode = createVscodeMock({
    Position: class {
        constructor(line, char) {
            this.line = line;
            this.character = char;
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
});
installVscodeMock(vscode);


const {ThriftParser} = require('../../../out/ast/parser.js');

const testContent = `
struct SharedStruct {
    1: required string name,
    2: optional i32 value
}
`;

console.log('Testing AST parsing with string input...');
const parser = new ThriftParser(testContent);
const ast = parser.parse();

console.log('\\nAST properties:', Object.keys(ast));
console.log('AST type:', ast.type);
console.log('AST has body:', !!ast.body);

if (ast.body && ast.body.length > 0) {
    console.log('Body count:', ast.body.length);
    console.log('\\nFirst item in body:');
    const item = ast.body[0];
    console.log('  Type:', item.type);
    console.log('  Name:', item.name);

    if (item.name === 'SharedStruct') {
        console.log('\\n✅ FOUND SharedStruct in AST!');
    }
}

console.log('\\n✅ Test complete!');
