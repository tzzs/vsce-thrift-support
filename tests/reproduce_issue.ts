
import { ThriftFormatter } from '../src/thriftFormatter';
import { ThriftFormattingOptions } from '../src/interfaces';

const formatter = new ThriftFormatter();
const input = `
enum Status {
    A = 10
    B = 20
    ACTIVE = 1
}
`;

const options: ThriftFormattingOptions = {
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
} as any;

const output = formatter.formatThriftCode(input, options);
const fs = require('fs');
fs.writeFileSync('reproduce_output.txt', '---Input---\n' + input + '\n---Output---\n' + output);
