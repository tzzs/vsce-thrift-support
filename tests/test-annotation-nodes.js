// Test annotation parsing functionality
// This test verifies that annotation nodes are properly parsed and preserved

// Mock the annotation parser functions for testing
function parseAnnotations(text) {
    const annotations = [];
    const annotationRanges = [];
    let strippedText = text;
    let currentIndex = 0;

    while (currentIndex < text.length) {
        // Find the next annotation start
        const annotationStart = text.indexOf('(', currentIndex);
        if (annotationStart === -1) {
            break;
        }

        // Find the matching closing parenthesis
        let parenDepth = 0;
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let escaped = false;
        let annotationEnd = -1;

        for (let i = annotationStart; i < text.length; i++) {
            const ch = text[i];

            // Handle escape sequences
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }

            // Handle quoted strings
            if (!escaped) {
                if (ch === '"' && !inSingleQuote) {
                    inDoubleQuote = !inDoubleQuote;
                } else if (ch === '\'' && !inDoubleQuote) {
                    inSingleQuote = !inSingleQuote;
                }
            } else {
                escaped = false;
            }

            // Track parentheses only outside quoted strings
            if (!inSingleQuote && !inDoubleQuote) {
                if (ch === '(') {
                    parenDepth++;
                } else if (ch === ')') {
                    parenDepth--;
                    if (parenDepth === 0) {
                        annotationEnd = i;
                        break;
                    }
                }
            }
        }

        if (annotationEnd !== -1) {
            const rawText = text.substring(annotationStart, annotationEnd + 1);
            const annotationContent = text.substring(annotationStart + 1, annotationEnd);
            
            // Parse key-value pairs
            const pairs = [];
            const assignments = annotationContent.split(',').map(s => s.trim()).filter(s => s);
            
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
                startIndex: annotationStart,
                endIndex: annotationEnd
            });

            annotationRanges.push({
                start: annotationStart,
                end: annotationEnd
            });

            // Remove this annotation from the stripped text
            const beforeAnnotation = strippedText.substring(0, annotationStart);
            const afterAnnotation = strippedText.substring(annotationEnd + 1);
            strippedText = beforeAnnotation + afterAnnotation;
            
            // Adjust current index for next search
            currentIndex = annotationStart;
        } else {
            // If parsing failed, skip this position
            currentIndex = annotationStart + 1;
        }
    }

    return {
        annotations,
        strippedText: strippedText.trim(),
        annotationRanges
    };
}

function stripTypeAnnotations(text) {
    const parseResult = parseAnnotations(text);
    return {
        strippedType: parseResult.strippedText,
        annotationNodes: parseResult.annotations.length > 0 ? parseResult.annotations : undefined
    };
}

// Test cases for annotation parsing
const testCases = [
    {
        name: "Simple annotation",
        input: "string name ( foo = 'bar' )",
        expectedStripped: "string name",
        expectedAnnotations: [{
            name: "foo",
            value: "'bar'",
            start: 11,
            end: 24
        }]
    },
    {
        name: "Multiple annotations",
        input: "string name ( foo = 'bar', baz = 123 )",
        expectedStripped: "string name",
        expectedAnnotations: [
            {
                name: "foo",
                value: "'bar'",
                start: 11,
                end: 24
            },
            {
                name: "baz",
                value: "123",
                start: 26,
                end: 35
            }
        ]
    },
    {
        name: "No annotations",
        input: "string name",
        expectedStripped: "string name",
        expectedAnnotations: []
    },
    {
        name: "Complex value",
        input: "string name ( description = 'This is a \"test\" value' )",
        expectedStripped: "string name",
        expectedAnnotations: [{
            name: "description",
            value: "'This is a \"test\" value'",
            start: 11,
            end: 48
        }]
    }
];

console.log("Testing annotation parsing and stripTypeAnnotations...\n");

testCases.forEach(testCase => {
    console.log(`Testing: ${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);
    
    // Test stripTypeAnnotations
    const { strippedType, annotationNodes } = stripTypeAnnotations(testCase.input);
    
    console.log(`Stripped: "${strippedType}"`);
    console.log(`Annotations:`, annotationNodes);
    
    // Verify stripped type
    if (strippedType === testCase.expectedStripped) {
        console.log("✓ Stripped type matches expected");
    } else {
        console.log(`✗ Stripped type mismatch. Expected: "${testCase.expectedStripped}", Got: "${strippedType}"`);
    }
    
    // Verify annotations
    if (JSON.stringify(annotationNodes) === JSON.stringify(testCase.expectedAnnotations)) {
        console.log("✓ Annotations match expected");
    } else {
        console.log(`✗ Annotations mismatch. Expected:`, testCase.expectedAnnotations);
        console.log(`Got:`, annotationNodes);
    }
    
    console.log("---");
});

// Test parseAnnotations directly
console.log("\nTesting parseAnnotations directly...");
const annotationTests = [
    "( foo = 'bar' )",
    "( foo = 'bar', baz = 123 )",
    "( description = 'Test description', required = true )",
    "()"
];

annotationTests.forEach(annotation => {
    console.log(`\nParsing: ${annotation}`);
    const result = parseAnnotations(annotation);
    console.log(`Result:`, result);
});