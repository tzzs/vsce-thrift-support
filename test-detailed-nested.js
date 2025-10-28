const fs = require('fs');
const path = require('path');

// Load the grammar file
const grammarPath = path.join(__dirname, 'syntaxes', 'thrift.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));

console.log('=== Checking typedef pattern ===');
const typedefPattern = grammar.repository['typedef-definitions'].patterns[0];
console.log('Typedef pattern:', JSON.stringify(typedefPattern, null, 2));

console.log('\n=== Checking types pattern ===');
const typesPattern = grammar.repository['types'].patterns;
console.log('Types patterns:', JSON.stringify(typesPattern, null, 2));

console.log('\n=== Checking nested-types pattern ===');
const nestedTypesPattern = grammar.repository['nested-types'].patterns;
console.log('Nested-types patterns:', JSON.stringify(nestedTypesPattern, null, 2));

// Test file content
const testFilePath = path.join(__dirname, 'test-files', 'nested-containers.thrift');
const testContent = fs.readFileSync(testFilePath, 'utf8');

console.log('\n=== Test file content ===');
console.log(testContent);

// Check specific lines
const lines = testContent.split('\n');
console.log('\n=== Problematic lines ===');
console.log('Line 7 (typedef):', lines[6]);
console.log('Line 20 (field):', lines[19]);
console.log('Line 35 (field):', lines[34]);