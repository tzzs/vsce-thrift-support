const assert = require('assert');
const vscode = require('vscode');
const { MinimalWorkspaceSymbolProvider, MinimalReferencesProvider } = require('../out/minimalProviders');

/**
 * Unit tests for minimal providers
 */
async function testMinimalProvidersUnit() {
    console.log('Running unit tests for minimal providers...');
    
    // Test MinimalWorkspaceSymbolProvider
    console.log('Testing MinimalWorkspaceSymbolProvider...');
    const symbolProvider = new MinimalWorkspaceSymbolProvider();
    
    // Test with empty query (should return cached results without scanning)
    const emptyQuerySymbols = await symbolProvider.provideWorkspaceSymbols('', { isCancellationRequested: false });
    console.log(`Empty query returned ${emptyQuerySymbols.length} symbols`);
    assert(Array.isArray(emptyQuerySymbols), 'Should return an array');
    
    // Test with short query (should return cached results without scanning)
    const shortQuerySymbols = await symbolProvider.provideWorkspaceSymbols('t', { isCancellationRequested: false });
    console.log(`Short query returned ${shortQuerySymbols.length} symbols`);
    assert(Array.isArray(shortQuerySymbols), 'Should return an array');
    
    // Test MinimalReferencesProvider
    console.log('Testing MinimalReferencesProvider...');
    const referencesProvider = new MinimalReferencesProvider();
    
    // Create a mock document
    const mockDocument = {
        uri: vscode.Uri.file('test.thrift'),
        getText: () => 'struct Test { 1: required string name; } struct Test { 2: required i32 value; }',
        getWordRangeAtPosition: (position) => {
            if (position.line === 0 && position.character >= 7 && position.character <= 11) {
                return new vscode.Range(0, 7, 0, 11); // "Test"
            }
            return null;
        },
        languageId: 'thrift'
    };
    
    const mockPosition = new vscode.Position(0, 9); // Position on "Test"
    const mockContext = { includeDeclaration: true };
    const mockToken = { isCancellationRequested: false };
    
    // Test references provider
    const references = await referencesProvider.provideReferences(
        mockDocument, 
        mockPosition, 
        mockContext, 
        mockToken
    );
    
    console.log(`References found: ${references.length}`);
    assert(Array.isArray(references), 'Should return an array of references');
    assert(references.length >= 2, 'Should find at least 2 references to "Test"');
    
    console.log('All unit tests passed!');
}

// Run the tests if this script is executed directly
if (require.main === module) {
    testMinimalProvidersUnit().catch(console.error);
}

module.exports = { testMinimalProvidersUnit };