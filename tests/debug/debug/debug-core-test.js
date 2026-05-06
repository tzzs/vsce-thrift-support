const { spawn } = require('child_process');

const child = spawn('node', ['tests/test-format-core.js'], {
    stdio: 'pipe',
    shell: true
});

let output = '';

child.stdout.on('data', (data) => {
    output += data.toString();
});

child.stderr.on('data', (data) => {
    output += data.toString();
});

child.on('close', (code) => {
    console.log('Exit code:', code);
    console.log('Full output:');
    console.log(output);
    
    // Find failing tests
    const lines = output.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('✗')) {
            console.log(`\nFailing test at line ${index + 1}:`);
            console.log(line);
            // Show context
            for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) {
                console.log(`${i + 1}: ${lines[i]}`);
            }
        }
    });
});