// Test annotation nodes with real Thrift parsing
const fs = require('fs');
const path = require('path');

// Load the actual annotation parser from the source
const { parseAnnotations } = require('../out/annotationParser');

console.log("Testing annotation nodes with real Thrift content...");

// Test parsing individual field lines
const testLines = [
    '1: required string name (foo = "bar", baz = 123),',
    '2: optional i32 age (python.immutable = "", cpp.ref = "true"),',
    '3: string email (deprecated = "true", validation.regex = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"),',
    'User getUser(1: i32 userId (validation.min = 1)),',
    'void updateUser(1: User user (validation.required = "true")),'
];

console.log("\nTesting individual field lines:");

testLines.forEach((line, index) => {
    console.log(`\nLine ${index + 1}: ${line}`);
    
    // Extract the annotation part directly using a simpler regex
    const annotationMatch = line.match(/\(.+\)/);
    if (annotationMatch) {
        const annotationPart = annotationMatch[0];
        console.log(`Found annotation: ${annotationPart}`);
        
        // Parse the annotation
        try {
            const parseResult = parseAnnotations(annotationPart);
            console.log(`Parsed annotations: ${JSON.stringify(parseResult.annotations, null, 2)}`);
            
            if (parseResult.annotations.length > 0) {
                console.log(`Number of annotation pairs: ${parseResult.annotations[0].pairs.length}`);
                parseResult.annotations[0].pairs.forEach((pair, i) => {
                    console.log(`  Pair ${i + 1}: ${pair.key} = ${pair.value}`);
                });
            }
        } catch (error) {
            console.log(`Error parsing annotation: ${error.message}`);
        }
    } else {
        console.log("No annotation found");
    }
});

console.log("\nTest completed!");