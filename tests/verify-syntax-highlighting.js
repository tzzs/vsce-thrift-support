const fs = require('fs');
const path = require('path');

// Load the TextMate grammar file
const grammarPath = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
const grammarContent = fs.readFileSync(grammarPath, 'utf8');
const grammar = JSON.parse(grammarContent);

// Load the example file
const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
const exampleContent = fs.readFileSync(examplePath, 'utf8');

// Simple tokenizer based on our grammar patterns
function tokenizeLine(line) {
  const tokens = [];
  
  // Check for keywords
  const keywords = grammar.repository.keywords.patterns[0].match.split('|');
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'keyword'
      });
    }
  }
  
  // Check for types
  const types = grammar.repository.types.patterns[0].match.split('|');
  for (const type of types) {
    const regex = new RegExp(`\\b${type}\\b`, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'type'
      });
    }
  }
  
  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);
  
  return tokens;
}

// Test the specific problematic lines (correct 0-indexed)
const lines = exampleContent.split('\\n');
const testLines = [
  { lineNum: 25, desc: 'Struct field with required' }, // line 26 (0-indexed)
  { lineNum: 26, desc: 'Struct field with optional' }, // line 27
  { lineNum: 55, desc: 'Method with throws' }, // line 56
  { lineNum: 56, desc: 'Method with throws' }, // line 57
  { lineNum: 57, desc: 'Method with throws' }, // line 58
  { lineNum: 58, desc: 'Method with throws' }, // line 59
  { lineNum: 112, desc: 'Enum field' }  // line 113 (the last enum)
];

console.log('Testing syntax highlighting for problematic lines:\\n');

for (const test of testLines) {
  const line = lines[test.lineNum];
  if (!line) {
    console.log(`${test.desc} (line ${test.lineNum + 1}): NOT FOUND`);
    continue;
  }
  
  console.log(`${test.desc} (line ${test.lineNum + 1}):`);
  console.log(`  Line: "${line.trim()}"`);
  
  const tokens = tokenizeLine(line);
  if (tokens.length > 0) {
    console.log('  Highlighted tokens:');
    for (const token of tokens) {
      console.log(`    - "${token.text}" (${token.type})`);
    }
  } else {
    console.log('  No highlighted tokens found');
    // Debug: show what patterns we're looking for
    console.log('  Looking for patterns: required, optional, string, User, throws, etc.');
  }
  console.log();
}

console.log('✓ Syntax highlighting verification completed!');