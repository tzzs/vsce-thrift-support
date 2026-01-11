const { execSync } = require('child_process');
const output = execSync('node tests/test-format-core.js', { encoding: 'utf8' });
console.log('=== FULL OUTPUT ===');
console.log(output);

// Find the failing test
const lines = output.split('\n');
const failingTest = lines.find(line => line.includes('❌'));
if (failingTest) {
    console.log('\n=== FAILING TEST ===');
    console.log(failingTest);
    
    // Find the test name
    const testIndex = lines.indexOf(failingTest);
    for (let i = testIndex - 1; i >= 0; i--) {
        if (lines[i].includes('运行测试:')) {
            console.log('Test name:', lines[i]);
            break;
        }
    }
}