const assert = require('assert');
const {PrintBuffer} = require('../../../out/formatter/printer');

describe('PrintBuffer', function () {
    describe('basic rendering', () => {
        it('renders plain text', () => {
            const buf = new PrintBuffer();
            buf.text('hello world');
            assert.deepStrictEqual(buf.render(), ['hello world']);
        });

        it('renders text with newlines', () => {
            const buf = new PrintBuffer();
            buf.text('line1').newline().text('line2');
            assert.deepStrictEqual(buf.render(), ['line1', 'line2']);
        });

        it('renders indentation', () => {
            const buf = new PrintBuffer({indentStr: '    '});
            buf.indent(1).text('indented');
            assert.deepStrictEqual(buf.render(), ['    indented']);
        });

        it('renders nested indentation', () => {
            const buf = new PrintBuffer({indentStr: '  '});
            buf.indent(2).text('deep');
            assert.deepStrictEqual(buf.render(), ['    deep']);
        });

        it('renders empty buffer as empty', () => {
            const buf = new PrintBuffer();
            assert.deepStrictEqual(buf.render(), []);
        });
    });

    describe('softline behavior', () => {
        it('softline uses fallback when within maxWidth', () => {
            const buf = new PrintBuffer({maxWidth: 100});
            buf.group(g => {
                g.text('a').softline().text('b');
            });
            assert.deepStrictEqual(buf.render(), ['a b']);
        });

        it('softline uses fallback with custom string', () => {
            const buf = new PrintBuffer({maxWidth: 100});
            buf.group(g => {
                g.text('a').softline(', ').text('b');
            });
            assert.deepStrictEqual(buf.render(), ['a, b']);
        });

        it('softline breaks when exceeding maxWidth', () => {
            const buf = new PrintBuffer({maxWidth: 10});
            buf.group(g => {
                g.text('aaaaaaa').softline().text('bbbbbbb');
            });
            assert.deepStrictEqual(buf.render(), ['aaaaaaa', 'bbbbbbb']);
        });
    });

    describe('group behavior', () => {
        it('fit group stays on one line when it fits', () => {
            const buf = new PrintBuffer({maxWidth: 40});
            buf.group(g => {
                g.text('func(').text('arg1').softline(', ').text('arg2').text(')');
            });
            assert.deepStrictEqual(buf.render(), ['func(arg1, arg2)']);
        });

        it('fit group breaks when too long', () => {
            const buf = new PrintBuffer({maxWidth: 15});
            buf.group(g => {
                g.text('func(').text('arg1').softline(', ').text('arg2').text(')');
            });
            assert.deepStrictEqual(buf.render(), ['func(arg1', 'arg2)']);
        });

        it('always-break group always breaks', () => {
            const buf = new PrintBuffer({maxWidth: 1000});
            buf.group(g => {
                g.text('a').softline().text('b');
            }, 'always-break');
            assert.deepStrictEqual(buf.render(), ['a', 'b']);
        });

        it('nested groups', () => {
            const buf = new PrintBuffer({maxWidth: 100});
            buf.group(outer => {
                outer.text('outer(');
                outer.group(inner => {
                    inner.text('inner1').softline(', ').text('inner2');
                });
                outer.text(')');
            });
            assert.deepStrictEqual(buf.render(), ['outer(inner1, inner2)']);
        });
    });

    describe('complex scenarios', () => {
        it('struct field formatting', () => {
            const buf = new PrintBuffer({indentStr: '    ', maxWidth: 100});
            buf.indent(1).text('1: required i32 id,').newline();
            buf.indent(1).text('2: optional string name');
            assert.deepStrictEqual(buf.render(), [
                '    1: required i32 id,',
                '    2: optional string name'
            ]);
        });

        it('service method with auto-wrap params', () => {
            const buf = new PrintBuffer({indentStr: '    ', maxWidth: 40});
            buf.indent(1);
            buf.group(g => {
                g.text('User getUser(');
                g.softline('');
                g.indent(2);
                g.text('1: i32 userId');
                g.softline(', ');
                g.text('2: string token');
                g.softline('');
                g.text(')');
            });
            const result = buf.render();
            assert.ok(result.length >= 1);
            assert.ok(result[0].includes('getUser'));
        });

        it('multiple lines with mixed content', () => {
            const buf = new PrintBuffer({indentStr: '    ', maxWidth: 100});
            buf.text('namespace cpp test').newline();
            buf.newline();
            buf.text('struct User {').newline();
            buf.indent(1).text('1: i32 id').newline();
            buf.text('}');
            const result = buf.render();
            assert.strictEqual(result.length, 5);
            assert.strictEqual(result[0], 'namespace cpp test');
            assert.strictEqual(result[1], '');
            assert.strictEqual(result[2], 'struct User {');
            assert.strictEqual(result[3], '    1: i32 id');
            assert.strictEqual(result[4], '}');
        });
    });
});
