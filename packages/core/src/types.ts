/**
 * Core type abstractions — structurally compatible with vscode.Position,
 * vscode.Range, vscode.Uri, and vscode.DiagnosticSeverity.
 *
 * TypeScript structural typing allows these to be used interchangeably
 * with their vscode counterparts without any explicit conversion.
 *
 * Reference: tests/test-helpers/vscode-mock.js
 */

export class Position {
    constructor(
        public readonly line: number,
        public readonly character: number
    ) {}
}

export class Range {
    public readonly start: Position;
    public readonly end: Position;

    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
    constructor(start: Position, end: Position);
    constructor(
        startLineOrStart: number | Position,
        startCharacterOrEnd: number | Position,
        endLine?: number,
        endCharacter?: number
    ) {
        if (
            startLineOrStart instanceof Position &&
            startCharacterOrEnd instanceof Position
        ) {
            this.start = startLineOrStart;
            this.end = startCharacterOrEnd;
        } else if (
            typeof startLineOrStart === 'object' &&
            startLineOrStart !== null &&
            typeof startCharacterOrEnd === 'object' &&
            startCharacterOrEnd !== null
        ) {
            // Duck-typed Position objects (e.g. from vscode.Position)
            this.start = new Position(
                (startLineOrStart as Position).line,
                (startLineOrStart as Position).character
            );
            this.end = new Position(
                (startCharacterOrEnd as Position).line,
                (startCharacterOrEnd as Position).character
            );
        } else {
            this.start = new Position(
                startLineOrStart as number,
                startCharacterOrEnd as number
            );
            this.end = new Position(endLine!, endCharacter!);
        }
    }

    contains(position: Position): boolean {
        return (
            position.line >= this.start.line &&
            position.line <= this.end.line &&
            (position.line !== this.start.line || position.character >= this.start.character) &&
            (position.line !== this.end.line || position.character <= this.end.character)
        );
    }
}

export class Location {
    constructor(
        public readonly uri: Uri,
        public readonly range: Range
    ) {}
}

export class Uri {
    public readonly fsPath: string;

    constructor(
        public readonly scheme: string,
        public readonly authority: string,
        public readonly path: string,
        public readonly query: string,
        public readonly fragment: string
    ) {
        this.fsPath = path;
    }

    static file(filePath: string): Uri {
        return new Uri('file', '', filePath, '', '');
    }

    static parse(value: string): Uri {
        if (!value || typeof value !== 'string') {
            return new Uri('file', '', '', '', '');
        }
        const match = value.match(/^([a-zA-Z0-9+.-]+):\/\/([^/]*)(.*)$/);
        if (!match) {
            return new Uri('file', '', value, '', '');
        }
        const scheme = match[1];
        const authority = match[2];
        let rest = match[3] || '';
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

    toString(): string {
        const authorityPart = this.authority ? this.authority : '';
        const queryPart = this.query ? `?${this.query}` : '';
        const fragmentPart = this.fragment ? `#${this.fragment}` : '';
        return `${this.scheme}://${authorityPart}${this.path}${queryPart}${fragmentPart}`;
    }
}

export class TextEdit {
    constructor(
        public readonly range: Range,
        public readonly newText: string
    ) {}

    static replace(range: Range, newText: string): TextEdit {
        return new TextEdit(range, newText);
    }
}

export class DocumentSymbol {
    public children: DocumentSymbol[] = [];

    constructor(
        public readonly name: string,
        public readonly detail: string,
        public readonly kind: number,
        public readonly range: Range,
        public readonly selectionRange: Range
    ) {}
}

export const SymbolKind = {
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
} as const;

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3
}

export class SelectionRange {
    constructor(
        public readonly range: Range,
        public readonly parent?: SelectionRange
    ) {}
}
