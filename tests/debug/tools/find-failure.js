const { execSync } = require('child_process');

try {
    const output = execSync('node tests/test-format-core.js', { encoding: 'utf8' });
    console.log('=== FULL OUTPUT ===');
    console.log(output);
    
    // Find the failing test
    const lines = output.split('\n');
    const failingTest = lines.find(line => line.includes('❌') || line.includes('失败'));
    if (failingTest) {
        console.log('\n=== FAILING TEST ===');
        console.log(failingTest);
        
        // Find the test name by looking backwards
        const testIndex = lines.indexOf(failingTest);
        for (let i = testIndex - 1; i >= 0; i--) {
            if (lines[i].includes('运行测试:')) {
                console.log('Test name:', lines[i].replace('运行测试:', '').trim());
                break;
            }
        }
    }
    
    // Look for any assertion errors
    const assertionError = lines.find(line => line.includes('AssertionError') || line.includes('expected') || line.includes('actual'));
    if (assertionError) {
        console.log('\n=== ASSERTION ERROR ===');
        console.log(assertionError);
    }
    
} catch (error) {
    console.log('=== ERROR OUTPUT ===');
    console.log(error.stdout || error.message);
    console.log('=== STDERR ===');
    console.log(error.stderr || '');
}