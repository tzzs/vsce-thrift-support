// Test annotation integration with field parsing
const fs = require('fs');
const path = require('path');

// Load the actual annotation parser from the source
const { parseAnnotations, extractAnnotationsFromField } = require('../out/annotationParser');

console.log("Testing annotation integration with field parsing...");

// Test parsing individual field lines with annotations
const testFields = [
    '1: required string name (foo = "bar", baz = 123),',
    '2: optional i32 age (python.immutable = "", cpp.ref = "true"),',
    '3: string email (deprecated = "true", validation.regex = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"),',
    '4: list<string> tags (min_size = 1, max_size = 10),',
    '5: map<string, i32> scores (validation.required = "true"),',
    '6: i32 count,'  // No annotations
];

console.log("\nTesting annotation extraction from field lines:");

testFields.forEach((fieldLine, index) => {
    console.log(`\nField ${index + 1}: ${fieldLine}`);
    
    try {
        // Test the extractAnnotationsFromField function
        const result = extractAnnotationsFromField(fieldLine);
        
        console.log(`Extracted field line: "${result.fieldLine}"`);
        
        if (result.annotations && result.annotations.length > 0) {
            console.log(`Found ${result.annotations.length} annotation(s):`);
            result.annotations.forEach((annotation, i) => {
                console.log(`  Annotation ${i + 1}:`);
                console.log(`    Raw text: ${annotation.rawText}`);
                console.log(`    Start index: ${annotation.startIndex}`);
                console.log(`    End index: ${annotation.endIndex}`);
                console.log(`    Pairs: ${annotation.pairs.length}`);
                annotation.pairs.forEach((pair, j) => {
                    console.log(`      ${pair.key} = ${pair.value}`);
                });
            });
        } else {
            console.log(`No annotations found`);
        }
    } catch (error) {
        console.log(`Error processing field: ${error.message}`);
    }
});

console.log("\nTesting direct annotation parsing:");

// Test direct annotation parsing
const annotationTexts = [
    '(foo = "bar", baz = 123)',
    '(python.immutable = "", cpp.ref = "true")',
    '(deprecated = "true", validation.regex = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")',
    '(min_size = 1, max_size = 10)',
    '(validation.required = "true")'
];

annotationTexts.forEach((annotationText, index) => {
    console.log(`\nAnnotation ${index + 1}: ${annotationText}`);
    
    try {
        const result = parseAnnotations(annotationText);
        console.log(`Stripped text: "${result.strippedText}"`);
        
        if (result.annotations.length > 0) {
            console.log(`Parsed ${result.annotations.length} annotation(s):`);
            result.annotations.forEach((annotation, i) => {
                console.log(`  Annotation ${i + 1}:`);
                console.log(`    Raw text: ${annotation.rawText}`);
                console.log(`    Pairs: ${annotation.pairs.length}`);
                annotation.pairs.forEach((pair, j) => {
                    console.log(`      ${pair.key} = ${pair.value}`);
                });
            });
        }
    } catch (error) {
        console.log(`Error parsing annotation: ${error.message}`);
    }
});

console.log("\nTest completed!");