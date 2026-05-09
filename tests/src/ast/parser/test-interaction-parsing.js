const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('interaction-parsing', () => {
    it('should parse interaction with functions', () => {
        const content = [
            'interaction MyInteraction {',
            '  oneway void send(1: string msg)',
            '  string getReply()',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const interactionNode = ast.body.find(n => n.type === 'Interaction');
        assert.ok(interactionNode, 'Interaction node should exist');
        assert.strictEqual(interactionNode.name, 'MyInteraction');
        assert.strictEqual(interactionNode.functions.length, 2);

        const sendFn = interactionNode.functions.find(f => f.name === 'send');
        assert.ok(sendFn, 'send function should exist');
        assert.strictEqual(sendFn.returnType, 'void');
        assert.strictEqual(sendFn.oneway, true);
        assert.strictEqual(sendFn.arguments.length, 1);
        assert.strictEqual(sendFn.arguments[0].name, 'msg');
        assert.strictEqual(sendFn.arguments[0].fieldType, 'string');

        const replyFn = interactionNode.functions.find(f => f.name === 'getReply');
        assert.ok(replyFn, 'getReply function should exist');
        assert.strictEqual(replyFn.returnType, 'string');
        assert.strictEqual(replyFn.oneway, false);
    });

    it('should parse stream return type in service method', () => {
        const content = [
            'service StreamService {',
            '  stream<i32> getEvents(1: i32 lastId)',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const svc = ast.body.find(n => n.type === 'Service');
        assert.ok(svc, 'Service node should exist');
        assert.strictEqual(svc.functions.length, 1);

        const fn = svc.functions[0];
        assert.strictEqual(fn.name, 'getEvents');
        assert.strictEqual(fn.isStream, true);
        assert.strictEqual(fn.isSink, undefined);
        assert.strictEqual(fn.returnType, 'stream<i32>');
    });

    it('should parse sink return type in service method', () => {
        const content = [
            'service LogService {',
            '  sink<string, LogSummary> uploadLogs()',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const svc = ast.body.find(n => n.type === 'Service');
        assert.ok(svc, 'Service node should exist');
        assert.strictEqual(svc.functions.length, 1);

        const fn = svc.functions[0];
        assert.strictEqual(fn.name, 'uploadLogs');
        assert.strictEqual(fn.isSink, true);
        assert.strictEqual(fn.isStream, undefined);
        assert.strictEqual(fn.returnType, 'sink<string, LogSummary>');
    });

    it('should parse stream combined with oneway', () => {
        const content = [
            'service TestService {',
            '  oneway stream<i32> pushData(1: i32 id)',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const svc = ast.body.find(n => n.type === 'Service');
        const fn = svc.functions[0];
        assert.strictEqual(fn.oneway, true);
        assert.strictEqual(fn.isStream, true);
        assert.strictEqual(fn.returnType, 'stream<i32>');
    });

    it('should parse performs declaration inside service', () => {
        const content = [
            'service MyService {',
            '  performs MyInteraction',
            '  void doSomething()',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const svc = ast.body.find(n => n.type === 'Service');
        assert.ok(svc, 'Service node should exist');
        assert.ok(svc.performs, 'Service should have performs array');
        assert.strictEqual(svc.performs.length, 1);
        assert.strictEqual(svc.performs[0].type, 'Performs');
        assert.strictEqual(svc.performs[0].interactionName, 'MyInteraction');
        assert.strictEqual(svc.performs[0].name, 'MyInteraction');
        assert.strictEqual(svc.functions.length, 1);
        assert.strictEqual(svc.functions[0].name, 'doSomething');
    });

    it('should parse interaction next to service at top level', () => {
        const content = [
            'namespace java com.example',
            'interaction MyInteraction {',
            '  oneway void onEvent(1: string data)',
            '}',
            'service MyService {',
            '  performs MyInteraction',
            '  void run()',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const interactionNode = ast.body.find(n => n.type === 'Interaction');
        const serviceNode = ast.body.find(n => n.type === 'Service');

        assert.ok(interactionNode, 'Interaction should be parsed');
        assert.strictEqual(interactionNode.name, 'MyInteraction');
        assert.strictEqual(interactionNode.functions.length, 1);

        assert.ok(serviceNode, 'Service should be parsed');
        assert.ok(serviceNode.performs, 'Service should have performs');
        assert.strictEqual(serviceNode.performs[0].interactionName, 'MyInteraction');
    });

    it('should handle regular method without stream/sink flags', () => {
        const content = [
            'service NormalService {',
            '  string getData()',
            '  i32 count()',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const svc = ast.body.find(n => n.type === 'Service');
        assert.strictEqual(svc.functions.length, 2);

        const getData = svc.functions.find(f => f.name === 'getData');
        assert.strictEqual(getData.returnType, 'string');
        assert.strictEqual(getData.isStream, undefined);
        assert.strictEqual(getData.isSink, undefined);
        assert.strictEqual(getData.oneway, false);
    });
});