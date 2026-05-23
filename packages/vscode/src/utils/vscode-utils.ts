import * as vscode from 'vscode';
import {ErrorHandler} from '@tanzz/thrift-core';

type AnyRange = {start: {line: number; character: number}; end: {line: number; character: number}};

export function toVscodeRange(r: AnyRange): vscode.Range {
    return new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
}

type LocationCtor = new (uri: vscode.Uri, range: vscode.Range) => vscode.Location;

const locationCtor: LocationCtor | undefined =
    typeof vscode.Location === 'function' ? (vscode.Location) : undefined;

export function createLocation(uri: vscode.Uri, range: AnyRange): vscode.Location {
    const vscRange = toVscodeRange(range);
    if (locationCtor) {
        const location = ErrorHandler.getInstance().safe(() => new locationCtor(uri, vscRange), null);
        if (location) {
            return location;
        }
    }
    return {uri, range: vscRange};
}
