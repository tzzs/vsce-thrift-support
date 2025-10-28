const fs = require('fs');
const path = require('path');

// Load the TextMate grammar
const grammarPath = path.join(__dirname, 'syntaxes', 'thrift.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));

// Test lines from the problematic file
const testLines = [
  '  4: list<list<string>> nested_lists',
  '  5: map<string, map<i32, list<double>>> nested_maps',
  '  6: set<list<set<string>>> nested_sets',
  'typedef list<list<map<string, i32>>> DeepType',
  'typedef set<list<map<i32, set<string>>>> VeryComplexType'
];

console.log('Testing nested container syntax highlighting...\n');

// Analyze the grammar patterns for nested types
function analyzePattern(pattern, indent = '') {
  console.log(`${indent}Pattern: ${pattern.name || 'unnamed'}`);
  if (pattern.begin) {
    console.log(`${indent}  Begin: ${pattern.begin}`);
  }
  if (pattern.end) {
    console.log(`${indent}  End: ${pattern.end}`);
  }
  if (pattern.match) {
    console.log(`${indent}  Match: ${pattern.match}`);
  }
  if (pattern.patterns) {
    console.log(`${indent}  Sub-patterns:`);
    pattern.patterns.forEach(subPattern => {
      analyzePattern(subPattern, indent + '    ');
    });
  }
}

console.log('=== NESTED TYPES PATTERNS ===');
if (grammar.repository['nested-types']) {
  grammar.repository['nested-types'].patterns.forEach(pattern => {
    analyzePattern(pattern);
  });
}

console.log('\n=== TYPES PATTERNS ===');
if (grammar.repository.types) {
  grammar.repository.types.patterns.forEach(pattern => {
    analyzePattern(pattern);
  });
}

console.log('\n=== FIELD DEFINITIONS PATTERNS ===');
if (grammar.repository['field-definitions']) {
  grammar.repository['field-definitions'].patterns.forEach(pattern => {
    analyzePattern(pattern);
  });
}

// Test regex matching
console.log('\n=== TESTING REGEX MATCHING ===');

// Test the field definition regex
const fieldRegex = /\s*([0-9]+)\s*:\s*(required|optional)?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-z_][a-zA-Z0-9_]*)/;
const nestedTypeRegex = /\b(map|list|set)\s*</;

testLines.forEach(line => {
  console.log(`\nTesting: ${line}`);
  
  const fieldMatch = line.match(fieldRegex);
  if (fieldMatch) {
    console.log(`  Field match: ${JSON.stringify(fieldMatch)}`);
    console.log(`  Type captured: "${fieldMatch[3]}"`);
  } else {
    console.log('  No field match');
  }
  
  const nestedMatch = line.match(nestedTypeRegex);
  if (nestedMatch) {
    console.log(`  Nested type match: ${JSON.stringify(nestedMatch)}`);
  } else {
    console.log('  No nested type match');
  }
});

console.log('\n=== ANALYSIS COMPLETE ===');