
const { ThriftFormatter } = require('./out/thriftFormatter');
const fs = require('fs');

const formatter = new ThriftFormatter();
const input = `
enum Status {
    A = 10
    B = 20
    ACTIVE = 1
}
`;

const options = {
    method: 'formatThriftCode',
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: true,
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

try {
    const output = formatter.formatThriftCode(input, options);
    fs.writeFileSync('reproduce_output.txt', '---Input---\n' + input + '\n---Output---\n' + output);
    console.log('Success');
} catch (e) {
    fs.writeFileSync('reproduce_output.txt', 'Error: ' + e.toString());
    console.error(e);
}
