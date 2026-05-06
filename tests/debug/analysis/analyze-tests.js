const { execSync } = require('child_process');

// Run the test file and capture all output
const output = execSync('node tests/test-format-core.js', { encoding: 'utf8' });

console.log('=== ANALYZING TEST OUTPUT ===\n');

// Split output into lines
const lines = output.split('\n');

// Find all test names and their status
const testResults = [];
let currentTest = null;
let inTest = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is the start of a test
    if (line.includes('运行测试:')) {
        if (currentTest) {
            testResults.push(currentTest);
        }
        currentTest = {
            name: line.replace('运行测试:', '').trim(),
            status: 'unknown',
            lines: [line]
        };
        inTest = true;
    } else if (currentTest && inTest) {
        currentTest.lines.push(line);
        
        // Check for pass/fail indicators
        if (line.includes('✓')) {
            currentTest.status = 'passed';
            inTest = false;
        } else if (line.includes('❌') || line.includes('✗')) {
            currentTest.status = 'failed';
            inTest = false;
        }
    }
}

// Add the last test
if (currentTest) {
    testResults.push(currentTest);
}

console.log('=== TEST RESULTS ===');
testResults.forEach((test, index) => {
    console.log(`${index + 1}. ${test.name}: ${test.status}`);
    if (test.status === 'failed') {
        console.log('   Failed lines:');
        test.lines.forEach(line => console.log(`   ${line}`));
    }
});

// Count results
const passed = testResults.filter(t => t.status === 'passed').length;
const failed = testResults.filter(t => t.status === 'failed').length;
const unknown = testResults.filter(t => t.status === 'unknown').length;

console.log(`\n=== SUMMARY ===`);
console.log(`Total tests: ${testResults.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Unknown: ${unknown}`);

// Look for any error messages that might not be associated with a specific test
console.log('\n=== ERROR MESSAGES ===');
const errorLines = lines.filter(line => 
    line.includes('Error') || 
    line.includes('AssertionError') || 
    line.includes('expected') || 
    line.includes('actual')
);
errorLines.forEach(line => console.log(line));