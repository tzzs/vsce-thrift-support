// Simple test for annotation parsing
console.log("Testing annotation parsing...");

function parseAnnotations(text) {
    const annotations = [];
    
    // Find annotation start
    const start = text.indexOf('(');
    if (start === -1) {
        return { annotations: [], strippedText: text.trim() };
    }
    
    // Find matching closing parenthesis
    let depth = 0;
    let inQuotes = false;
    let quoteChar = null;
    let escaped = false;
    let end = -1;
    
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        
        if (escaped) {
            escaped = false;
            continue;
        }
        
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        
        if (!inQuotes && (ch === '"' || ch === "'")) {
            inQuotes = true;
            quoteChar = ch;
        } else if (inQuotes && ch === quoteChar) {
            inQuotes = false;
            quoteChar = null;
        }
        
        if (!inQuotes) {
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
    }
    
    if (end === -1) {
        return { annotations: [], strippedText: text.trim() };
    }
    
    // Extract annotation content
    const rawText = text.substring(start, end + 1);
    const content = text.substring(start + 1, end);
    
    // Parse key-value pairs
    const pairs = [];
    const assignments = content.split(',').map(s => s.trim()).filter(s => s);
    
    for (const assignment of assignments) {
        const eqIndex = assignment.indexOf('=');
        if (eqIndex !== -1) {
            const key = assignment.substring(0, eqIndex).trim();
            const value = assignment.substring(eqIndex + 1).trim();
            pairs.push({ key, value });
        } else {
            pairs.push({ key: assignment, value: '' });
        }
    }
    
    annotations.push({
        type: 'annotation',
        rawText,
        pairs,
        startIndex: start,
        endIndex: end
    });
    
    // Remove annotation from text
    const strippedText = (text.substring(0, start) + text.substring(end + 1)).trim();
    
    return { annotations, strippedText };
}

function stripTypeAnnotations(text) {
    const parseResult = parseAnnotations(text);
    return {
        strippedType: parseResult.strippedText,
        annotationNodes: parseResult.annotations.length > 0 ? parseResult.annotations : undefined
    };
}

// Test cases
const testCases = [
    {
        name: "Simple annotation",
        input: "string name ( foo = 'bar' )",
        expectedStripped: "string name",
        expectedAnnotations: 1
    },
    {
        name: "Multiple annotations",
        input: "string name ( foo = 'bar', baz = 123 )",
        expectedStripped: "string name",
        expectedAnnotations: 1
    },
    {
        name: "No annotations",
        input: "string name",
        expectedStripped: "string name",
        expectedAnnotations: 0
    }
];

testCases.forEach(testCase => {
    console.log(`\nTesting: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);
    
    const { strippedType, annotationNodes } = stripTypeAnnotations(testCase.input);
    
    console.log(`Stripped: "${strippedType}"`);
    console.log(`Annotations count: ${annotationNodes ? annotationNodes.length : 0}`);
    
    if (strippedType === testCase.expectedStripped) {
        console.log("✓ Stripped type matches expected");
    } else {
        console.log(`✗ Stripped type mismatch. Expected: "${testCase.expectedStripped}", Got: "${strippedType}"`);
    }
    
    const actualAnnotationCount = annotationNodes ? annotationNodes.length : 0;
    if (actualAnnotationCount === testCase.expectedAnnotations) {
        console.log("✓ Annotation count matches expected");
    } else {
        console.log(`✗ Annotation count mismatch. Expected: ${testCase.expectedAnnotations}, Got: ${actualAnnotationCount}`);
    }
    
    if (annotationNodes && annotationNodes.length > 0) {
        console.log("Annotation details:", JSON.stringify(annotationNodes[0], null, 2));
    }
});

console.log("\nTest completed!");