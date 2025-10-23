// Test field annotation parsing integration
const fs = require('fs');
const path = require('path');

// Load the actual field parser from the source
const { parseStructField } = require('./out/formattingProvider');

console.log("Testing field annotation parsing integration...");

// Test parsing individual field lines with annotations
const testFields = [
    '1: required string name (foo = "bar", baz = 123),',
    '2: optional i32 age (python.immutable = "", cpp.ref = "true"),',
    '3: string email (deprecated = "true", validation.regex = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"),',
    '4: list<string> tags (min_size = 1, max_size = 10),',
    '5: map<string, i32> scores (validation.required = "true"),'
];

console.log("\nTesting field parsing with annotations:");

testFields.forEach((fieldLine, index) => {
    console.log(`\nField ${index + 1}: ${fieldLine}`);
    
    try {
        const field = parseStructField(fieldLine);
        console.log(`Parsed field:`);
        console.log(`  ID: ${field.id}`);
        console.log(`  Required: ${field.required}`);
        console.log(`  Type: ${field.type}`);
        console.log(`  Name: ${field.name}`);
        
        if (field.annotations && field.annotations.length > 0) {
            console.log(`  Annotations:`);
            field.annotations.forEach((annotation, i) => {
                console.log(`    Annotation ${i + 1}:`);
                console.log(`      Raw text: ${annotation.rawText}`);
                console.log(`      Pairs: ${annotation.pairs.length}`);
                annotation.pairs.forEach((pair, j) => {
                    console.log(`        ${pair.key} = ${pair.value}`);
                });
            });
        } else {
            console.log(`  No annotations found`);
        }
    } catch (error) {
        console.log(`Error parsing field: ${error.message}`);
    }
});

console.log("\nTest completed!");