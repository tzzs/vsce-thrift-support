"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const thriftFormatter_1 = require("../src/thriftFormatter");
const formatter = new thriftFormatter_1.ThriftFormatter();
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
const output = formatter.formatThriftCode(input, options);
const fs = require('fs');
fs.writeFileSync('reproduce_output.txt', '---Input---\n' + input + '\n---Output---\n' + output);
//# sourceMappingURL=reproduce_issue.js.map