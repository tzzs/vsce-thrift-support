// Simple test to verify nested container parsing logic
console.log('Testing nested container parsing logic...\n');

// Simulate the extractAngleContent function
function extractAngleContent(typeText) {
    let start = -1;
    let depth = 0;
    
    for (let i = 0; i < typeText.length; i++) {
        const ch = typeText[i];
        if (ch === '<') {
            if (depth === 0) {
                start = i + 1;
            }
            depth++;
        } else if (ch === '>') {
            depth--;
            if (depth === 0 && start !== -1) {
                return typeText.slice(start, i);
            }
        }
    }
    
    // Fallback: if no matching brackets found, return empty string
    return '';
}

// Simulate the splitTopLevelAngles function
function splitTopLevelAngles(typeInner) {
    const parts = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < typeInner.length; i++) {
        const ch = typeInner[i];
        if (ch === '<') {depth++;}
        if (ch === '>') {depth = Math.max(0, depth - 1);}
        if (ch === ',' && depth === 0) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf) {parts.push(buf);}
    return parts.map(s => s.trim()).filter(Boolean);
}

// Simulate the parseContainerType function
function parseContainerType(typeText) {
    const noSpace = typeText.replace(/\s+/g, '');
    // list<T>
    if (/^list<.*>$/.test(noSpace)) {
        const inner = extractAngleContent(typeText);
        return inner.trim().length > 0;
    }
    // set<T>
    if (/^set<.*>$/.test(noSpace)) {
        const inner = extractAngleContent(typeText);
        return inner.trim().length > 0;
    }
    // map<K,V> (ensure exactly two top-level parts)
    if (/^map<.*>$/.test(noSpace)) {
        const inner = extractAngleContent(typeText);
        const parts = splitTopLevelAngles(inner);
        return parts.length === 2;
    }
    return false;
}

// Test cases
const testCases = [
    'list<i32>',
    'map<string, i32>',
    'set<string>',
    'list<list<i32>>',
    'list<list<map<string, i32>>>',
    'set<map<string, list<i64>>>',
    'map<string, list<set<double>>>',
    'set<list<map<i32, set<string>>>>',
    'list<map<string, list<set<i64>>>>',
];

console.log('Testing parseContainerType function:');
console.log('=====================================');

let passed = 0;
let failed = 0;

testCases.forEach(testCase => {
    const result = parseContainerType(testCase);
    const status = result ? '✓' : '✗';
    
    if (result) {
        passed++;
    } else {
        failed++;
    }
    
    console.log(`${status} ${testCase}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error('Some test cases failed!');
    process.exit(1);
} else {
    console.log('All test cases passed!');
}

// Test the extractAngleContent function specifically for nested cases
console.log('\n\nTesting extractAngleContent function:');
console.log('=====================================');

const extractTestCases = [
    { input: 'list<i32>', expected: 'i32' },
    { input: 'list<list<i32>>', expected: 'list<i32>' },
    { input: 'list<list<map<string, i32>>>', expected: 'list<map<string, i32>>' },
    { input: 'map<string, list<i32>>', expected: 'string, list<i32>' },
    { input: 'set<list<map<i32, string>>>', expected: 'list<map<i32, string>>' },
];

extractTestCases.forEach(testCase => {
    const result = extractAngleContent(testCase.input);
    const status = result === testCase.expected ? '✓' : '✗';
    console.log(`${status} extractAngleContent("${testCase.input}") = "${result}" (expected: "${testCase.expected}")`);
});