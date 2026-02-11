import * as vscode from 'vscode';
import {ErrorHandler} from './error-handler';

type LocationCtor = new (uri: vscode.Uri, range: vscode.Range) => vscode.Location;

const locationCtor: LocationCtor | undefined =
    typeof vscode.Location === 'function' ? (vscode.Location as LocationCtor) : undefined;

/**
 * Creates a VS Code Location object in a test-compatible way.
 *
 * In production VS Code environment, uses the Location constructor.
 * In test environments where Location might not be a proper constructor,
 * falls back to creating a plain object with the required properties.
 *
 * @param uri - The file URI
 * @param range - The range within the file
 * @returns A vscode.Location instance or compatible object
 */
export function createLocation(uri: vscode.Uri, range: vscode.Range): vscode.Location {
    if (locationCtor) {
        const location = ErrorHandler.getInstance().safe(() => new locationCtor(uri, range), null);
        if (location) {
            return location;
        }
    }
    return {uri, range} as vscode.Location;
}
