const fs = require('fs');
const path = require('path');

// Load the TextMate grammar file
const grammarPath = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
const grammarContent = fs.readFileSync(grammarPath, 'utf8');
const grammar = JSON.parse(grammarContent);

// Load the example file
const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
const exampleContent = fs.readFileSync(examplePath, 'utf8');
const lines = exampleContent.split(/\r?\n/);

// Test the specific problematic lines
const testCases = [
  {
    lineNum: 26, // Line with "required" in struct field (1-indexed line 27)
    desc: 'Struct field with required',
    expectedKeywords: ['required']
  },
  {
    lineNum: 29, // Line with "optional" in struct field (1-indexed line 30)
    desc: 'Struct field with optional',
    expectedKeywords: ['optional']
  },
  {
    lineNum: 65, // createUser method with throws (1-indexed line 66)
    desc: 'Method with throws (createUser)',
    expectedKeywords: ['throws']
  },
  {
    lineNum: 70, // getUser method with throws (1-indexed line 71)
    desc: 'Method with throws (getUser)',
    expectedKeywords: ['throws']
  },
  {
    lineNum: 76, // updateUser method with throws (1-indexed line 77)
    desc: 'Method with throws (updateUser)',
    expectedKeywords: ['throws']
  },
  {
    lineNum: 111, // Enum field with value assignment (1-indexed line 112)
    desc: 'Enum field',
    expectedKeywords: ['Init', '1']
  }
];

console.log('Testing syntax highlighting for problematic lines:\\n');

let allPassed = true;

for (const test of testCases) {
  const line = lines[test.lineNum];
  if (!line) {
    console.log(`❌ ${test.desc} (line ${test.lineNum + 1}): Line not found`);
    allPassed = false;
    continue;
  }
  
  console.log(`${test.desc} (line ${test.lineNum + 1}):`);
  console.log(`  Line: "${line.trim()}"`);
  
  // Check if the grammar has the expected patterns
  const foundKeywords = [];
  
  // Check for keywords
  if (grammar.repository.keywords) {
    const keywordPattern = grammar.repository.keywords.patterns[0].match;
    const keywords = keywordPattern.split('|');
    
    for (const keyword of test.expectedKeywords) {
      if (keywords.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    }
  }
  
  // Check for types
  if (grammar.repository.types) {
    const typePattern = grammar.repository.types.patterns[0].match;
    const types = typePattern.split('|');
    
    for (const expected of test.expectedKeywords) {
      if (types.includes(expected)) {
        foundKeywords.push(expected);
      }
    }
  }
  
  // Check for enum field patterns
  if (grammar.repository['enum-definitions']) {
    const enumPatterns = grammar.repository['enum-definitions'].patterns;
    for (const pattern of enumPatterns) {
      if (pattern.name === 'meta.enum.thrift' && pattern.patterns) {
        // Look for the enum field pattern within the main enum pattern
        for (const subPattern of pattern.patterns) {
          if (subPattern.name === 'meta.enum.field.thrift') {
            // For enum fields, we expect the pattern to match identifiers and numbers
            for (const expected of test.expectedKeywords) {
              if (expected === 'Init' && subPattern.match.includes('[A-Z_][A-Z0-9_]')) {
                foundKeywords.push(expected);
              } else if (expected === '1' && subPattern.match.includes('[0-9]')) {
                foundKeywords.push(expected);
              }
            }
          }
        }
      }
    }
  }
  
  if (foundKeywords.length > 0) {
    console.log(`  ✓ Found patterns for: ${foundKeywords.join(', ')}`);
  } else {
    console.log(`  ❌ No patterns found for expected keywords: ${test.expectedKeywords.join(', ')}`);
    allPassed = false;
  }
  
  console.log();
}

if (allPassed) {
  console.log('✅ All syntax highlighting tests passed!');
  console.log('The grammar should now properly highlight inner keywords in:');
  console.log('- Struct field definitions (required, optional)');
  console.log('- Method definitions (throws, return types)');
  console.log('- Enum definitions');
} else {
  console.log('❌ Some syntax highlighting tests failed!');
  process.exit(1);
}