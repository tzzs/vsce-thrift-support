"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectionRange = exports.DiagnosticSeverity = exports.SymbolKind = exports.DocumentSymbol = exports.TextEdit = exports.Uri = exports.Location = exports.Range = exports.Position = void 0;
class Position {
    line;
    character;
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}
exports.Position = Position;
class Range {
    start;
    end;
    constructor(startLineOrStart, startCharacterOrEnd, endLine, endCharacter) {
        if (startLineOrStart instanceof Position &&
            startCharacterOrEnd instanceof Position) {
            this.start = startLineOrStart;
            this.end = startCharacterOrEnd;
        }
        else if (typeof startLineOrStart === 'object' &&
            startLineOrStart !== null &&
            typeof startCharacterOrEnd === 'object' &&
            startCharacterOrEnd !== null) {
            this.start = new Position(startLineOrStart.line, startLineOrStart.character);
            this.end = new Position(startCharacterOrEnd.line, startCharacterOrEnd.character);
        }
        else {
            this.start = new Position(startLineOrStart, startCharacterOrEnd);
            this.end = new Position(endLine, endCharacter);
        }
    }
    contains(position) {
        return (position.line >= this.start.line &&
            position.line <= this.end.line &&
            (position.line !== this.start.line || position.character >= this.start.character) &&
            (position.line !== this.end.line || position.character <= this.end.character));
    }
}
exports.Range = Range;
class Location {
    uri;
    range;
    constructor(uri, range) {
        this.uri = uri;
        this.range = range;
    }
}
exports.Location = Location;
class Uri {
    scheme;
    authority;
    path;
    query;
    fragment;
    fsPath;
    constructor(scheme, authority, path, query, fragment) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
        this.fsPath = path;
    }
    static file(filePath) {
        return new Uri('file', '', filePath, '', '');
    }
    static parse(value) {
        if (!value || typeof value !== 'string') {
            return new Uri('file', '', '', '', '');
        }
        const protoIdx = value.indexOf('://');
        if (protoIdx < 1) {
            return new Uri('file', '', value, '', '');
        }
        const scheme = value.slice(0, protoIdx);
        const afterProto = value.slice(protoIdx + 3);
        const slashIdx = afterProto.indexOf('/');
        const authority = slashIdx === -1 ? afterProto : afterProto.slice(0, slashIdx);
        let rest = slashIdx === -1 ? '' : afterProto.slice(slashIdx);
        let fragment = '';
        let query = '';
        const hashIndex = rest.indexOf('#');
        if (hashIndex !== -1) {
            fragment = rest.slice(hashIndex + 1);
            rest = rest.slice(0, hashIndex);
        }
        const queryIndex = rest.indexOf('?');
        if (queryIndex !== -1) {
            query = rest.slice(queryIndex + 1);
            rest = rest.slice(0, queryIndex);
        }
        const pathValue = rest || '';
        return new Uri(scheme, authority, pathValue, query, fragment);
    }
    toString() {
        const authorityPart = this.authority ? this.authority : '';
        const queryPart = this.query ? `?${this.query}` : '';
        const fragmentPart = this.fragment ? `#${this.fragment}` : '';
        return `${this.scheme}://${authorityPart}${this.path}${queryPart}${fragmentPart}`;
    }
}
exports.Uri = Uri;
class TextEdit {
    range;
    newText;
    constructor(range, newText) {
        this.range = range;
        this.newText = newText;
    }
    static replace(range, newText) {
        return new TextEdit(range, newText);
    }
}
exports.TextEdit = TextEdit;
class DocumentSymbol {
    name;
    detail;
    kind;
    range;
    selectionRange;
    children = [];
    constructor(name, detail, kind, range, selectionRange) {
        this.name = name;
        this.detail = detail;
        this.kind = kind;
        this.range = range;
        this.selectionRange = selectionRange;
    }
}
exports.DocumentSymbol = DocumentSymbol;
exports.SymbolKind = {
    Struct: 0,
    Class: 1,
    Enum: 2,
    Interface: 3,
    Field: 4,
    EnumMember: 5,
    Method: 6,
    Namespace: 7,
    File: 8,
    TypeParameter: 9,
    Constant: 10,
    Variable: 11
};
var DiagnosticSeverity;
(function (DiagnosticSeverity) {
    DiagnosticSeverity[DiagnosticSeverity["Error"] = 0] = "Error";
    DiagnosticSeverity[DiagnosticSeverity["Warning"] = 1] = "Warning";
    DiagnosticSeverity[DiagnosticSeverity["Information"] = 2] = "Information";
    DiagnosticSeverity[DiagnosticSeverity["Hint"] = 3] = "Hint";
})(DiagnosticSeverity = exports.DiagnosticSeverity || (exports.DiagnosticSeverity = {}));
class SelectionRange {
    range;
    parent;
    constructor(range, parent) {
        this.range = range;
        this.parent = parent;
    }
}
exports.SelectionRange = SelectionRange;
//# sourceMappingURL=types.js.map