const assert = require('assert');
const {ErrorHandler} = require('../../../out/utils/error-handler.js');

describe('error-handler-safe', () => {
    it('should return fallback on exception', () => {
        const handler = new ErrorHandler();
        const value = handler.safe(() => {
            throw new Error('boom');
        }, 'fallback');
        assert.strictEqual(value, 'fallback');
    });

    it('should return value when no exception', () => {
        const handler = new ErrorHandler();
        const value = handler.safe(() => 42, 0);
        assert.strictEqual(value, 42);
    });
});
