"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeUriContentKey = exports.makeUriRangeKey = exports.makeLineRangeKey = void 0;
const cache_expiry_1 = require("./cache-expiry");
function makeLineRangeKey(range) {
    return `${range.startLine}-${range.endLine}`;
}
exports.makeLineRangeKey = makeLineRangeKey;
function makeUriRangeKey(uri, range) {
    return `${uri}:${makeLineRangeKey(range)}`;
}
exports.makeUriRangeKey = makeUriRangeKey;
function makeUriContentKey(uri, content, version) {
    const hash = (0, cache_expiry_1.hashContent)(content, true);
    return version !== undefined ? `${uri}@${hash}:${version}` : `${uri}@${hash}`;
}
exports.makeUriContentKey = makeUriContentKey;
//# sourceMappingURL=cache-keys.js.map