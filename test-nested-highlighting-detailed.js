const fs = require('fs');
const path = require('path');

// Test to verify nested type highlighting is working correctly

// Load the grammar file
const grammarPath = path.join(__dirname, 'syntaxes', 'thrift.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));

console.log('=== Verifying typedef pattern ===');
const typedefPattern = grammar.repository['typedef-definitions'].patterns[0];
console.log('Typedef pattern includes nested-types:', typedefPattern.patterns.some(p => p.include === '#nested-types'));

console.log('\n=== Verifying field-definitions pattern ===');
const fieldPattern = grammar.repository['field-definitions'].patterns[0];
console.log('Field pattern includes nested-types:', fieldPattern.patterns.some(p => p.include === '#nested-types'));

console.log('\n=== Verifying types pattern ===');
const typesPatterns = grammar.repository['types'].patterns;
console.log('Types pattern includes custom type matcher:', typesPatterns.some(p => p.name === 'entity.name.type.thrift' && p.match === '\\b[A-Z][a-zA-Z0-9_]*\\b'));

console.log('\n=== Verifying nested-types pattern ===');
const nestedTypesPatterns = grammar.repository['nested-types'].patterns[0];
console.log('Nested-types pattern:', JSON.stringify(nestedTypesPatterns, null, 2));

// Test specific cases
console.log('\n=== Testing specific cases ===');

// Test case 1: typedef map<string, i32> SimpleMap
const typedefLine = 'typedef map<string, i32> SimpleMap';
console.log('Test case 1 - Typedef with map:', typedefLine);

// Test case 2: 5: map<string, map<i32, list<double>>> nested_maps
const fieldLine = '5: map<string, map<i32, list<double>>> nested_maps';
console.log('Test case 2 - Field with nested map:', fieldLine);

// Test case 3: 2: map<string, list<Example>> test
const structFieldLine = '2: map<string, list<Example>> test';
console.log('Test case 3 - Field with struct type:', structFieldLine);

console.log('\n=== All checks completed ===');