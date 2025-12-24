const {Position, workspace, Uri} = require('vscode');
const path = require('path');
const {ThriftDefinitionProvider} = require('./out/definitionProvider');

async function debugDefinitionDetailed() {
    console.log('🔍 Debugging definition provider in detail...');

    const doc = await workspace.openTextDocument(path.resolve(__dirname, 'test-files/main-edge.thrift'));
    const provider = new ThriftDefinitionProvider();

    // Test the exact failing case: line 6, SharedStruct
    const line = 6;
    const lineText = doc.lineAt(line).text;
    console.log(`Line ${line}: "${lineText}"`);

    const typeIdx = lineText.indexOf('SharedStruct');
    console.log(`SharedStruct found at index: ${typeIdx}`);

    const pos = new Position(line, typeIdx + 1);
    console.log(`Position: line ${pos.line}, character ${pos.character}`);

    // Let's manually parse what should be extracted
    const text = doc.getText();
    const lines = text.split('\n');
    const targetLine = lines[line];
    console.log(`Target line content: "${targetLine}"`);

    // Extract the type reference manually
    const typeRefMatch = targetLine.match(/(\w+)\.(\w+)/);
    if (typeRefMatch) {
        console.log(`Extracted namespace: ${typeRefMatch[1]}`);
        console.log(`Extracted type name: ${typeRefMatch[2]}`);
    }

    // Check what files are included
    const includeMatches = text.match(/^include\s+"([^"]+)"/gm);
    console.log(`Includes found:`, includeMatches);

    // Check if we can access the provider's internal methods
    console.log('\n--- Testing provider internals ---');

    // Test getIncludedFiles
    try {
        const includedFiles = await provider.getIncludedFiles(doc);
        console.log(`Included files found:`, includedFiles.map(f => path.basename(f.fsPath)));

        // Test each included file
        for (const includedFile of includedFiles) {
            console.log(`\n--- Testing file: ${path.basename(includedFile.fsPath)} ---`);

            try {
                const includedDoc = await workspace.openTextDocument(includedFile);
                const includedText = includedDoc.getText();

                // Check if SharedStruct exists in this file
                const sharedStructMatch = includedText.match(/struct\s+(\w+)/g);
                console.log(`Structs found in ${path.basename(includedFile.fsPath)}:`, sharedStructMatch);

                // Check specifically for SharedStruct
                const hasSharedStruct = /struct\s+SharedStruct/.test(includedText);
                console.log(`Has SharedStruct: ${hasSharedStruct}`);

                if (hasSharedStruct) {
                    console.log(`✅ Found SharedStruct in ${path.basename(includedFile.fsPath)}`);

                    // Test findDefinitionInDocument
                    const definition = await provider.findDefinitionInDocument(includedFile, includedText, 'SharedStruct');
                    console.log(`Definition result:`, definition);

                    if (definition) {
                        console.log(`Definition URI: ${definition.uri.fsPath}`);
                        console.log(`Definition basename: ${path.basename(definition.uri.fsPath)}`);
                    }
                }
            } catch (error) {
                console.log(`Error processing ${path.basename(includedFile.fsPath)}:`, error.message);
            }
        }
    } catch (error) {
        console.log('Error getting included files:', error.message);
    }

    console.log('\n--- Final test ---');
    const loc = await provider.provideDefinition(doc, pos, {});

    if (loc) {
        console.log(`✅ Definition found:`);
        console.log(`   URI: ${loc.uri.fsPath}`);
        console.log(`   Basename: ${path.basename(loc.uri.fsPath)}`);
        console.log(`   Expected basename: shared.thrift`);
        console.log(`   Match: ${path.basename(loc.uri.fsPath) === 'shared.thrift'}`);
    } else {
        console.log('❌ No definition found');
    }
}

// Run the debug function
debugDefinitionDetailed().catch(console.error);