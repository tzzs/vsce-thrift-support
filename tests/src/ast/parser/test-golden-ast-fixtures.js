const assert = require('assert');

const {ThriftParser} = require('../../../../out/ast/parser');

function summarize(ast) {
    return ast.body.map(node => ({
        type: node.type,
        name: node.name,
        namespace: node.namespace,
        path: node.path,
        aliasType: node.aliasType,
        fields: node.fields && node.fields.map(field => ({
            name: field.name,
            fieldType: field.fieldType,
            requiredness: field.requiredness
        })),
        functions: node.functions && node.functions.map(fn => ({
            name: fn.name,
            returnType: fn.returnType,
            isStream: fn.isStream === true,
            isSink: fn.isSink === true,
            arguments: fn.arguments.map(arg => ({
                name: arg.name,
                fieldType: arg.fieldType
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
                fields: [
                    {name: 'id', fieldType: 'uuid', requiredness: 'required'},
                    {name: 'parent', fieldType: 'reference User', requiredness: 'optional'}
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
                fields: undefined,
                functions: [
                    {
                        name: 'subscribe',
                        returnType: 'stream<string>',
                        isStream: true,
                        isSink: false,
                        arguments: [{name: 'events', fieldType: 'sink<string, string>'}]
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
                fields: undefined,
                functions: [
                    {
                        name: 'listUsers',
                        returnType: 'stream<User>',
                        isStream: true,
                        isSink: false,
                        arguments: [{name: 'id', fieldType: 'RequestId'}]
                    },
                    {
                        name: 'upload',
                        returnType: 'sink<string, string>',
                        isStream: false,
                        isSink: true,
                        arguments: [{name: 'payload', fieldType: 'binary'}]
                    }
                ],
                performs: ['ChatInteraction']
            }
        ]);
    });
});
