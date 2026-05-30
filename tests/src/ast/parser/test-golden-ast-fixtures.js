const assert = require('assert');

const {ThriftParser} = require('../../../../out/ast/parser');

function summarize(ast) {
    return ast.body.map(node => ({
        type: node.type,
        name: node.name,
        namespace: node.namespace,
        path: node.path,
        aliasType: node.aliasType,
        valueType: node.valueType,
        value: node.value,
        isSenum: node.isSenum === true,
        members: node.members && node.members.map(member => ({
            name: member.name,
            initializer: member.initializer
        })),
        fields: node.fields && node.fields.map(field => ({
            name: field.name,
            fieldType: field.fieldType,
            requiredness: field.requiredness,
            defaultValue: field.defaultValue
        })),
        functions: node.functions && node.functions.map(fn => ({
            name: fn.name,
            returnType: fn.returnType,
            isStream: fn.isStream === true,
            isSink: fn.isSink === true,
            arguments: fn.arguments.map(arg => ({
                name: arg.name,
                fieldType: arg.fieldType
            })),
            throws: fn.throws.map(field => ({
                name: field.name,
                fieldType: field.fieldType
            }))
        })),
        performs: node.performs && node.performs.map(perform => perform.interactionName)
    }));
}

describe('golden AST fixtures', function () {
    it('preserves Thrift 0.23+ AST shape for modern type features', function () {
        const text = [
            'namespace py demo',
            'include "common.thrift"',
            'typedef uuid RequestId',
            'struct User {',
            '  1: required uuid id',
            '  2: optional reference User parent',
            '}',
            'interaction ChatInteraction {',
            '  stream<string> subscribe(1: sink<string, string> events)',
            '}',
            'service ChatService {',
            '  performs ChatInteraction',
            '  stream<User> listUsers(1: RequestId id)',
            '  sink<string, string> upload(1: binary payload)',
            '}',
            ''
        ].join('\n');

        assert.deepStrictEqual(summarize(new ThriftParser(text).parse()), [
            {
                type: 'Namespace',
                name: 'demo',
                namespace: 'demo',
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Include',
                name: 'common.thrift',
                namespace: undefined,
                path: 'common.thrift',
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Typedef',
                name: 'RequestId',
                namespace: undefined,
                path: undefined,
                aliasType: 'uuid',
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Struct',
                name: 'User',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: [
                    {name: 'id', fieldType: 'uuid', requiredness: 'required', defaultValue: undefined},
                    {name: 'parent', fieldType: 'reference User', requiredness: 'optional', defaultValue: undefined}
                ],
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Interaction',
                name: 'ChatInteraction',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: [
                    {
                        name: 'subscribe',
                        returnType: 'stream<string>',
                        isStream: true,
                        isSink: false,
                        arguments: [{name: 'events', fieldType: 'sink<string, string>'}],
                        throws: []
                    }
                ],
                performs: undefined
            },
            {
                type: 'Service',
                name: 'ChatService',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: [
                    {
                        name: 'listUsers',
                        returnType: 'stream<User>',
                        isStream: true,
                        isSink: false,
                        arguments: [{name: 'id', fieldType: 'RequestId'}],
                        throws: []
                    },
                    {
                        name: 'upload',
                        returnType: 'sink<string, string>',
                        isStream: false,
                        isSink: true,
                        arguments: [{name: 'payload', fieldType: 'binary'}],
                        throws: []
                    }
                ],
                performs: ['ChatInteraction']
            }
        ]);
    });

    it('preserves AST shape for declarations with values, annotations, and throws', function () {
        const text = [
            'const map<string, list<i32>> DEFAULT_IDS = {',
            '  "a": [1, 2],',
            '  "b": [3]',
            '}',
            'enum Status {',
            '  OK = 1,',
            '  FAIL = 2 (deprecated="true")',
            '}',
            'struct Request {',
            '  1: required map<string, list<reference Status>> statuses = {"primary": []} (go.tag="json")',
            '  2: optional string note = "throws should stay a string"',
            '}',
            'exception RequestError {',
            '  1: string message',
            '}',
            'service RequestService {',
            '  Request get(1: uuid id) throws (1: RequestError err)',
            '}',
            ''
        ].join('\n');

        assert.deepStrictEqual(summarize(new ThriftParser(text).parse()), [
            {
                type: 'Const',
                name: 'DEFAULT_IDS',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: 'map<string, list<i32>>',
                value: '{\n  "a": [1, 2],\n  "b": [3]\n}',
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Enum',
                name: 'Status',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: [
                    {name: 'OK', initializer: '1'},
                    {name: 'FAIL', initializer: '2'}
                ],
                fields: undefined,
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Struct',
                name: 'Request',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: [
                    {
                        name: 'statuses',
                        fieldType: 'map<string, list<reference Status>>',
                        requiredness: 'required',
                        defaultValue: '{"primary": []}'
                    },
                    {
                        name: 'note',
                        fieldType: 'string',
                        requiredness: 'optional',
                        defaultValue: '"throws should stay a string"'
                    }
                ],
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Exception',
                name: 'RequestError',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: [
                    {name: 'message', fieldType: 'string', requiredness: undefined, defaultValue: undefined}
                ],
                functions: undefined,
                performs: undefined
            },
            {
                type: 'Service',
                name: 'RequestService',
                namespace: undefined,
                path: undefined,
                aliasType: undefined,
                valueType: undefined,
                value: undefined,
                isSenum: false,
                members: undefined,
                fields: undefined,
                functions: [
                    {
                        name: 'get',
                        returnType: 'Request',
                        isStream: false,
                        isSink: false,
                        arguments: [{name: 'id', fieldType: 'uuid'}],
                        throws: [{name: 'err', fieldType: 'RequestError'}]
                    }
                ],
                performs: undefined
            }
        ]);
    });
});
