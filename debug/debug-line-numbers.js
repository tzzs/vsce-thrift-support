// Debug script to check line numbers and positions
const text = `struct User {
  1: required i32 id,
  2: optional string name
}

enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}`;

const lines = text.split('\n');

console.log('Line numbers and content:');
lines.forEach((line, index) => {
    console.log(`${index}: "${line}"`);
});

console.log('\nChecking position (7, 2):');
console.log('Line 7:', '"' + lines[7] + '"');
console.log('Character at position 2:', '"' + lines[7][2] + '"');

console.log('\nChecking position (6, 2) - should be ACTIVE:');
console.log('Line 6:', '"' + lines[6] + '"');
console.log('Character at position 2:', '"' + lines[6][2] + '"');