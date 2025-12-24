// Mock VS Code API
const vscode = {
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    SelectionRange: class {
        constructor(range) {
            this.range = range;
            this.parent = null;
        }
    }
};

class ThriftSelectionRangeProvider {
    provideSelectionRanges(document, positions, token) {
        const ranges = [];
        
        for (const position of positions) {
            const rangesForPosition = [];
            this.provideSelectionRangesForPosition(document, position, rangesForPosition);
            if (rangesForPosition.length > 0) {
                ranges.push(rangesForPosition[0]); // Return the first range for each position
            }
        }
        
        return ranges;
    }

    provideSelectionRangesForPosition(document, position, ranges, token) {
        if (token?.isCancellationRequested) {
            return;
        }

        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line];
        
        console.log('Current line:', JSON.stringify(currentLine));
        console.log('Position:', position.line, position.character);
        console.log('Line length:', currentLine.length);
        
        // Show each character position
        for (let i = 0; i < currentLine.length; i++) {
            console.log(`Position ${i}: "${currentLine[i]}"`);
        }

        // Method definitions
        const methodMatch = currentLine.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (methodMatch) {
            console.log('Method match found:', methodMatch);
            console.log('Return type (group 3):', methodMatch[3]);
            console.log('Method name (group 4):', methodMatch[4]);
            
            // Calculate positions
            const returnTypeStart = currentLine.indexOf(methodMatch[3], methodMatch.index + methodMatch[1].length + (methodMatch[2] ? methodMatch[2].length : 0));
            const methodNameStart = currentLine.indexOf(methodMatch[4], returnTypeStart + methodMatch[3].length);
            
            console.log('Return type start:', returnTypeStart);
            console.log('Return type end:', returnTypeStart + methodMatch[3].length);
            console.log('Method name start:', methodNameStart);
            console.log('Method name end:', methodNameStart + methodMatch[4].length);
            
            // Check if position is on method name (excluding trailing space)
            if (position.character >= methodNameStart && position.character < methodNameStart + methodMatch[4].length) {
                console.log('Position is on method name');
                const methodNameRange = new vscode.Range(position.line, methodNameStart, position.line, methodNameStart + methodMatch[4].length);
                this.addRangeIfLarger(ranges, methodNameRange);
                
                // Add full method signature as parent
                const openParenIndex = currentLine.indexOf('(', methodNameStart + methodMatch[4].length);
                let closeParenIndex = -1;
                let parenDepth = 0;

                for (let i = openParenIndex; i < currentLine.length; i++) {
                    if (currentLine[i] === '(') {
                        parenDepth++;
                    } else if (currentLine[i] === ')') {
                        parenDepth--;
                        if (parenDepth === 0) {
                            closeParenIndex = i;
                            break;
                        }
                    }
                }

                if (closeParenIndex > 0) {
                    const methodSignature = currentLine.substring(methodMatch.index, closeParenIndex + 1);
                    const methodSignatureRange = new vscode.Range(position.line, methodMatch.index, position.line, closeParenIndex + 1);
                    
                    // Link method name to method signature
                    if (ranges.length > 0) {
                        ranges[ranges.length - 1].parent = new vscode.SelectionRange(methodSignatureRange);
                    }
                }
                
                return;
            }
            
            // Check if position is on return type (excluding trailing space)
            if (position.character >= returnTypeStart && position.character < returnTypeStart + methodMatch[3].length) {
                console.log('Position is on return type');
                const returnTypeRange = new vscode.Range(position.line, returnTypeStart, position.line, returnTypeStart + methodMatch[3].length);
                this.addRangeIfLarger(ranges, returnTypeRange);
                
                // Add full method signature as parent
                const openParenIndex = currentLine.indexOf('(', methodNameStart + methodMatch[4].length);
                let closeParenIndex = -1;
                let parenDepth = 0;

                for (let i = openParenIndex; i < currentLine.length; i++) {
                    if (currentLine[i] === '(') {
                        parenDepth++;
                    } else if (currentLine[i] === ')') {
                        parenDepth--;
                        if (parenDepth === 0) {
                            closeParenIndex = i;
                            break;
                        }
                    }
                }

                if (closeParenIndex > 0) {
                    const methodSignature = currentLine.substring(methodMatch.index, closeParenIndex + 1);
                    const methodSignatureRange = new vscode.Range(position.line, methodMatch.index, position.line, closeParenIndex + 1);
                    
                    // Link return type to method signature
                    if (ranges.length > 0) {
                        ranges[ranges.length - 1].parent = new vscode.SelectionRange(methodSignatureRange);
                    }
                }
                
                return;
            }
            
            // Check if position is on whitespace between return type and method name
            const isOnWhitespace = position.character >= returnTypeStart + methodMatch[3].length && position.character < methodNameStart;
            if (isOnWhitespace) {
                console.log('Position is on whitespace between return type and method name');
                // Prefer method name when on whitespace between components
                const methodNameRange = new vscode.Range(position.line, methodNameStart, position.line, methodNameStart + methodMatch[4].length);
                this.addRangeIfLarger(ranges, methodNameRange);
                
                // Add full method signature as parent
                const openParenIndex = currentLine.indexOf('(', methodNameStart + methodMatch[4].length);
                let closeParenIndex = -1;
                let parenDepth = 0;

                for (let i = openParenIndex; i < currentLine.length; i++) {
                    if (currentLine[i] === '(') {
                        parenDepth++;
                    } else if (currentLine[i] === ')') {
                        parenDepth--;
                        if (parenDepth === 0) {
                            closeParenIndex = i;
                            break;
                        }
                    }
                }

                if (closeParenIndex > 0) {
                    const methodSignature = currentLine.substring(methodMatch.index, closeParenIndex + 1);
                    const methodSignatureRange = new vscode.Range(position.line, methodMatch.index, position.line, closeParenIndex + 1);
                    
                    // Link method name to method signature
                    if (ranges.length > 0) {
                        ranges[ranges.length - 1].parent = new vscode.SelectionRange(methodSignatureRange);
                    }
                }
                
                return;
            }
        }

        // If no specific method component found, fall back to general logic
        return;
    }

    addRangeIfLarger(ranges, newRange) {
        if (ranges.length === 0 || this.isRangeLarger(newRange, ranges[ranges.length - 1].range)) {
            const newSelectionRange = new vscode.SelectionRange(newRange);
            if (ranges.length > 0) {
                newSelectionRange.parent = ranges[ranges.length - 1];
            }
            ranges.push(newSelectionRange);
        }
    }

    isRangeLarger(range1, range2) {
        const range1Size = range1.end.character - range1.start.character;
        const range2Size = range2.end.character - range2.start.character;
        return range1Size > range2Size;
    }
}

// Test the method name selection
function testMethodNameSelection() {
    console.log('Testing method name selection...');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId, 2: string name),
  void createUser(1: User user)
}`;
    const document = {
        getText: () => text
    };
    const position = new vscode.Position(1, 6); // On "getUser"
    
    const ranges = provider.provideSelectionRanges(document, [position]);
    
    if (ranges.length === 0) {
        console.log('No ranges found!');
        return;
    }
    
    const firstRange = ranges[0];
    const lines = text.split('\n');
    const line = lines[firstRange.range.start.line];
    const selectedText = line.substring(firstRange.range.start.character, firstRange.range.end.character);
    
    console.log('Selected text:', JSON.stringify(selectedText));
    console.log('Expected:', JSON.stringify('getUser'));
    
    if (selectedText === 'getUser') {
        console.log('✓ Test result: PASS');
    } else {
        console.log('✗ Test result: FAIL');
    }
}

testMethodNameSelection();