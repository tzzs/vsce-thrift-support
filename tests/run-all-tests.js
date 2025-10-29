#!/usr/bin/env node

/**
 * Test runner for all diagnostics tests
 * Runs all test files and reports results
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🧪 Running all diagnostics tests...');
console.log('=' .repeat(60));

const testFiles = [
  'test-diagnostics.js',
  'test-diagnostics-enhanced.js',
  'test-helper-functions.js',
  'test-diagnostics-edge-cases.js',
  'test-diagnostics-extends-namespaced.js',
  'test-throws-namespaced.js',
  'test-escape-sequence-fix.js'
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n📋 Running ${testFile}...`);
    console.log('-'.repeat(40));
    
    const testPath = path.join(__dirname, testFile);
    
    if (!fs.existsSync(testPath)) {
      console.log(`❌ Test file not found: ${testFile}`);
      failedTests++;
      resolve(false);
      return;
    }
    
    const child = spawn('node', [testPath], {
      stdio: 'pipe',
      cwd: __dirname
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      totalTests++;
      
      if (code === 0) {
        console.log(`✅ ${testFile} passed`);
        console.log(output);
        passedTests++;
        resolve(true);
      } else {
        console.log(`❌ ${testFile} failed (exit code: ${code})`);
        if (output) console.log('STDOUT:', output);
        if (errorOutput) console.log('STDERR:', errorOutput);
        failedTests++;
        resolve(false);
      }
    });
    
    child.on('error', (error) => {
      console.log(`❌ ${testFile} failed to run:`, error.message);
      failedTests++;
      resolve(false);
    });
  });
}

async function runAllTests() {
  console.log(`Found ${testFiles.length} test files to run:\n`);
  testFiles.forEach(file => console.log(`  - ${file}`));
  
  for (const testFile of testFiles) {
    await runTest(testFile);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary:');
  console.log('='.repeat(60));
  console.log(`Total tests run: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n💥 ${failedTests} test(s) failed!`);
    process.exit(1);
  }
}

// Check if we're in the right directory
const expectedFiles = ['test-diagnostics.js'];
const missingFiles = expectedFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));

if (missingFiles.length > 0) {
  console.log('❌ Missing required test files:', missingFiles);
  console.log('Make sure you are running this from the tests directory');
  process.exit(1);
}

runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});