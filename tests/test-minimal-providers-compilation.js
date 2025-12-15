/**
 * Simple test to verify minimal providers are compiled correctly
 */
const path = require('path');
const fs = require('fs');

function testMinimalProvidersCompilation() {
    console.log('Testing minimal providers compilation...');
    
    // Check if the compiled file exists
    const compiledPath = path.join(__dirname, '..', 'out', 'minimalProviders.js');
    
    if (!fs.existsSync(compiledPath)) {
        throw new Error('Compiled minimalProviders.js not found at: ' + compiledPath);
    }
    
    console.log('✓ Compiled minimalProviders.js found');
    
    // Try to require the module
    try {
        const minimalProviders = require(compiledPath);
        
        // Check if the required functions are exported
        if (typeof minimalProviders.MinimalWorkspaceSymbolProvider !== 'function') {
            throw new Error('MinimalWorkspaceSymbolProvider not exported');
        }
        console.log('✓ MinimalWorkspaceSymbolProvider exported');
        
        if (typeof minimalProviders.MinimalReferencesProvider !== 'function') {
            throw new Error('MinimalReferencesProvider not exported');
        }
        console.log('✓ MinimalReferencesProvider exported');
        
        if (typeof minimalProviders.registerMinimalProviders !== 'function') {
            throw new Error('registerMinimalProviders not exported');
        }
        console.log('✓ registerMinimalProviders exported');
        
        console.log('✓ All exports verified successfully');
        
    } catch (error) {
        throw new Error('Failed to require compiled module: ' + error.message);
    }
    
    console.log('✓ Minimal providers compilation test passed!');
}

// Run the test
try {
    testMinimalProvidersCompilation();
    console.log('\n🎉 All tests passed! The minimal providers are ready to use.');
} catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
}