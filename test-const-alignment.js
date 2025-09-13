// Mock vscode module before any imports
const vscode = {
    TextEdit: {
        replace: (range, newText) => ({ range, newText })
    },
    Range: function(startLine, startChar, endLine, endChar) {
        return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
    },
    workspace: {
        getConfiguration: () => ({
            get: (key) => {
                if (key === 'thriftSupport.formatting.alignStructFields') return true;
                if (key === 'thriftSupport.formatting.alignEnumFields') return true;
                if (key === 'thriftSupport.formatting.alignConstFields') return true;
                return undefined;
            }
        })
    }
};

// Mock the module system
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

// Import the formatter
const { ThriftFormattingProvider } = require('./out/formatter.js');

// Test const alignment
const testCode = `// Constants
const i32 MAX_USERS = 10000
const string DEFAULT_NAMESPACE = "com.example"
const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp", "javascript"]
const map<string, i32> ERROR_CODES = {
    "NOT_FOUND": 404,
    "INTERNAL_ERROR": 500
}

struct User {
    1: required string name
    2: optional i32 age
}`;

console.log('Original code:');
console.log(testCode);
console.log('\n' + '='.repeat(50) + '\n');

const formatter = new ThriftFormattingProvider();
const mockDocument = {
    getText: () => testCode,
    lineCount: testCode.split('\n').length
};

const mockRange = new vscode.Range(0, 0, mockDocument.lineCount - 1, 0);
const mockOptions = { insertSpaces: true, tabSize: 4 };

try {
    const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);
    
    if (edits && edits.length > 0) {
        const formattedCode = edits[0].newText;
        console.log('Formatted code:');
        console.log(formattedCode);
        
        // Check alignment
        const lines = formattedCode.split('\n');
        const constLines = lines.filter(line => line.trim().startsWith('const') && !line.includes('{'));
        
        console.log('\n' + '='.repeat(50));
        console.log('Const lines alignment check:');
        constLines.forEach((line, index) => {
            console.log(`Line ${index + 1}: "${line}"`);
        });
        
        if (constLines.length > 1) {
            // Check if types are aligned
            const typePositions = constLines.map(line => {
                const match = line.match(/const\s+(\w+(?:<[^>]+>)?(?:\[\])?)/); 
                return match ? line.indexOf(match[1]) : -1;
            });
            
            const namePositions = constLines.map(line => {
                const match = line.match(/const\s+\w+(?:<[^>]+>)?(?:\[\])?\s+(\w+)/);
                return match ? line.indexOf(match[1]) : -1;
            });
            
            const equalPositions = constLines.map(line => line.indexOf(' = '));
            
            console.log('\nAlignment analysis:');
            console.log('Type positions:', typePositions);
            console.log('Name positions:', namePositions);
            console.log('Equal positions:', equalPositions);
            
            const typesAligned = typePositions.every(pos => pos === typePositions[0]);
            const namesAligned = namePositions.every(pos => pos === namePositions[0]);
            const equalsAligned = equalPositions.every(pos => pos === equalPositions[0]);
            
            console.log('\nAlignment results:');
            console.log('Types aligned:', typesAligned);
            console.log('Names aligned:', namesAligned);
            console.log('Equals aligned:', equalsAligned);
            
            if (typesAligned && namesAligned && equalsAligned) {
                console.log('\n✅ Const alignment test PASSED!');
            } else {
                console.log('\n❌ Const alignment test FAILED!');
            }
        } else {
            console.log('\n⚠️  Not enough const lines to test alignment');
        }
        
    } else {
        console.log('No formatting changes made');
    }
} catch (error) {
    console.error('Error during formatting:', error);
}