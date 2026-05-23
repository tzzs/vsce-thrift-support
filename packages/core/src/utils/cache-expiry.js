"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashContent = exports.isFresh = exports.isExpired = void 0;
const crypto = __importStar(require("crypto"));
function isExpired(timestamp, ttlMs, now = Date.now()) {
    if (ttlMs <= 0) {
        return false;
    }
    return now - timestamp > ttlMs;
}
exports.isExpired = isExpired;
function isFresh(timestamp, ttlMs, now = Date.now()) {
    return !isExpired(timestamp, ttlMs, now);
}
exports.isFresh = isFresh;
function hashContent(content, useCrypto = true) {
    if (useCrypto) {
        try {
            return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        }
        catch {
        }
    }
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
        hash = (hash * 33) ^ content.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}
exports.hashContent = hashContent;
//# sourceMappingURL=cache-expiry.js.map