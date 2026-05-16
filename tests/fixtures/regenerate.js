#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('../require-hook.js');
const {ThriftFormatter} = require('../../out/formatter');

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'test-files');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const OPTIONS = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4
};

const FIXTURES = [
    'apache-thrift-test.thrift',
    'thrift_full_coverage.thrift',
    'example.thrift',
    'advanced-features.thrift',
    'nested-containers.thrift',
    'annotation-edge-cases.thrift'
];

if (!fs.existsSync(GOLDEN_DIR)) {
    fs.mkdirSync(GOLDEN_DIR, {recursive: true});
}

const formatter = new ThriftFormatter();
let count = 0;

for (const file of FIXTURES) {
    const srcPath = path.join(FIXTURE_DIR, file);
    if (!fs.existsSync(srcPath)) {
        console.warn(`  SKIP: ${file} (not found)`);
        continue;
    }
    const content = fs.readFileSync(srcPath, 'utf-8');
    const formatted = formatter.format(content, OPTIONS);
    const goldenName = file.replace('.thrift', '.formatted.thrift');
    fs.writeFileSync(path.join(GOLDEN_DIR, goldenName), formatted, 'utf-8');
    console.log(`  OK: ${file} → golden/${goldenName}`);
    count++;
}

console.log(`\nRegenerated ${count} golden files in ${GOLDEN_DIR}`);
