const assert = require('assert');

describe('core refactor helpers', function () {
    it('infers extract type edits from AST field type ranges', function () {
        const {
            buildExtractTypeEdits,
            inferExtractTypeTarget
        } = require('../../../out/refactor/type-refactor');
        const text = 'namespace js demo\n\nstruct User {\n  1: optional list<string> names\n}\n';

        const target = inferExtractTypeTarget(text, {line: 3, character: 18});
        const edits = buildExtractTypeEdits(target, 'NameList');

        assert.strictEqual(target.typeText, 'list<string>');
        assert.deepStrictEqual(target.typeRange, {
            start: {line: 3, character: 14},
            end: {line: 3, character: 26}
        });
        assert.strictEqual(edits.insertText, 'typedef list<string> NameList\n\n');
        assert.strictEqual(edits.insertPosition.line, 1);
        assert.strictEqual(edits.replaceText, 'NameList');
    });

    it('does not infer extract type targets inside include paths or primitive field types', function () {
        const {inferExtractTypeTarget} = require('../../../out/refactor/type-refactor');

        assert.strictEqual(
            inferExtractTypeTarget('include "shared.thrift"\n', {line: 0, character: 10}),
            undefined
        );
        assert.strictEqual(
            inferExtractTypeTarget('struct User {\n  1: string name\n}\n', {line: 1, character: 7}),
            undefined
        );
    });

    it('finds top-level declaration ranges for move type edits', function () {
        const {inferMoveTypeTarget} = require('../../../out/refactor/type-refactor');
        const text = 'include "shared.thrift"\n\nstruct User {\n  1: string name\n}\n\nstruct Other {}\n';

        const target = inferMoveTypeTarget(text, {line: 3, character: 4});

        assert.strictEqual(target.typeName, 'User');
        assert.strictEqual(target.typeText, 'struct User {\n  1: string name\n}');
        assert.deepStrictEqual(target.range, {
            start: {line: 2, character: 0},
            end: {line: 4, character: 1}
        });
    });

    it('infers nested generic field types before annotations', function () {
        const {inferExtractTypeTarget} = require('../../../out/refactor/type-refactor');
        const text = [
            'include "common.thrift"',
            'namespace js demo',
            '',
            'struct Local {',
            '  1: optional map<string, list<common.User>> users (go.tag = "users")',
            '}',
            ''
        ].join('\n');

        const target = inferExtractTypeTarget(text, {line: 4, character: 25});

        assert.strictEqual(target.typeText, 'map<string, list<common.User>>');
        assert.deepStrictEqual(target.typeRange, {
            start: {line: 4, character: 14},
            end: {line: 4, character: 44}
        });
        assert.deepStrictEqual(target.insertPosition, {line: 2, character: 0});
    });

    it('uses explicit selection ranges when extracting typedef aliases', function () {
        const {inferExtractTypeTarget} = require('../../../out/refactor/type-refactor');
        const text = 'typedef map<string, User> UserMap\n';

        const target = inferExtractTypeTarget(
            text,
            {line: 0, character: 10},
            {
                start: {line: 0, character: 8},
                end: {line: 0, character: 25}
            }
        );

        assert.strictEqual(target.typeText, 'map<string, User>');
        assert.deepStrictEqual(target.typeRange, {
            start: {line: 0, character: 8},
            end: {line: 0, character: 25}
        });
    });

    it('moves typedef, service, and interaction declarations by AST range', function () {
        const {inferMoveTypeTarget} = require('../../../out/refactor/type-refactor');
        const text = [
            'typedef string UserId',
            '',
            'service UserService {',
            '  UserId getUser(1: UserId id)',
            '}',
            '',
            'interaction UserFlow {',
            '  void close()',
            '}',
            ''
        ].join('\n');

        assert.strictEqual(inferMoveTypeTarget(text, {line: 0, character: 10}).typeText, 'typedef string UserId');
        assert.strictEqual(
            inferMoveTypeTarget(text, {line: 3, character: 4}).typeText,
            'service UserService {\n  UserId getUser(1: UserId id)\n}'
        );
        assert.strictEqual(
            inferMoveTypeTarget(text, {line: 7, character: 4}).typeText,
            'interaction UserFlow {\n  void close()\n}'
        );
    });
});
