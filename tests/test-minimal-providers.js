const vscode = require('vscode');
const path = require('path');

/**
 * Test minimal providers to ensure they don't scan other files when opening a single file
 */
async function testMinimalProviders() {
    console.log('Testing minimal providers...');
    
    try {
        // Get the test file path
        const testFilePath = path.join(__dirname, '..', 'test-thrift', 'test_091.thrift');
        const testFileUri = vscode.Uri.file(testFilePath);
        
        console.log(`Opening test file: ${testFilePath}`);
        
        // Open the test file
        const document = await vscode.workspace.openTextDocument(testFileUri);
        const editor = await vscode.window.showTextDocument(document);
        
        console.log('File opened successfully');
        
        // Wait a bit for any potential scanning to occur
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test workspace symbols with minimal query (should not trigger scanning)
        console.log('Testing workspace symbols with minimal query...');
        const minimalSymbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', 'te');
        console.log(`Minimal query returned ${minimalSymbols ? minimalSymbols.length : 0} symbols`);
        
        // Test workspace symbols with longer query (should trigger minimal scanning)
        console.log('Testing workspace symbols with longer query...');
        const longerSymbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', 'test');
        console.log(`Longer query returned ${longerSymbols ? longerSymbols.length : 0} symbols`);
        
        // Test references in current document
        console.log('Testing references in current document...');
        const position = new vscode.Position(21, 14); // Line with field_uptcq_3
        const references = await vscode.commands.executeCommand('vscode.executeReferenceProvider', testFileUri, position);
        console.log(`References found: ${references ? references.length : 0}`);
        
        console.log('Minimal providers test completed successfully!');
        
        // Close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        
    } catch (error) {
        console.error('Error during minimal providers test:', error);
        throw error;
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testMinimalProviders().catch(console.error);
}

module.exports = { testMinimalProviders };