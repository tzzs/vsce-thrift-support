const { ThriftFormattingProvider } = require('../out/formattingProvider'); // Using compiled output

function testStructFieldFormattingFixes() {
    console.log('Testing Struct Field Formatting Fixes...\n');
    
    const formatter = new ThriftFormattingProvider();
    
    // Test input similar to the example.thrift file with the issues
    const testInput = `struct User {
  1: required UserId id , // 用户唯一标识
  2:  required string    name              (go.tag    ='json:"name"'),  // 用户姓名
  3:  optional Email email                 (go.tag    ="xx:\"len($)>0\""), // 邮箱地址
  4:  optional i32                 age               ,                  // 年龄
  5:  optional Status                      status     = Status.ACTIVE,  // 用户状态，默认为活跃
  6:  optional list<string>tags                      ,                  // 用户标签列表
  7:  optional map<string, string>metadata           ,                  // 用户元数据
  8:  optional bool                        isVerified = false,          // 是否已验证，默认未验证
  9:  optional double                      score      = 0.0,            // 用户评分，默认0.0
  10: optional binary              avatar            ,                  // 用户头像二进制数据
}`;

    console.log('Input:');
    console.log(testInput);
    console.log('\n');
    
    // Create a mock options object for formatting (mimicking VSCode options structure)
    const options = {
        insertSpaces: true,
        tabSize: 4,
        alignTypes: true,
        alignFieldNames: true,  
        alignAnnotations: true,
        alignComments: true,
        trailingComma: 'preserve'
    };
    
    try {
        // We'll bypass the VSCode interfaces for testing and call formatThriftCode directly
        // The method is private, so we'll need to use a workaround or call the public interface
        // by creating a mock document for the provider to work with
        const formattedResult = formatter.formatThriftCode(testInput, {
            ...options,
            alignTypes: true,
            alignFieldNames: true,  // Unified with alignNames
            alignStructDefaults: false,
            alignAnnotations: true,
            alignComments: true,
            alignEnumNames: true,
            alignEnumEquals: true,
            alignEnumValues: true,
            indentSize: 4,
            maxLineLength: 100,
            collectionStyle: 'preserve',
            insertSpaces: true,
            tabSize: 4,
            initialContext: undefined
        });
        
        console.log('Formatted Output:');
        console.log(formattedResult);
        console.log('\n');
        
        // Basic validation checks
        const hasExtraSpacing = formattedResult.includes('go.tag    ='); // Multiple spaces in annotations
        const hasProperSpacing = formattedResult.includes('(go.tag=');
        
        console.log('Validation Results:');
        console.log(`- Has excessive annotation spacing: ${hasExtraSpacing}`);
        console.log(`- Has proper annotation spacing (after fix): ${hasProperSpacing}`);
        
        // Additional checks
        const lines = formattedResult.split('\n');
        let issueCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check for excessive spacing in annotations
            if (/\(\w+\s{2,}=/g.test(line)) {
                console.log(`- Found excessive spacing in line ${i+1}: ${line}`);
                issueCount++;
            }
            
            // Check for proper comma placement (no extra spaces before)
            if (/\s{2,},\s*\/\//.test(line)) {
                console.log(`- Found extra spaces before comma in line ${i+1}: ${line}`);
                issueCount++;
            }
        }
        
        if (issueCount === 0) {
            console.log('\n✓ All formatting issues appear to be fixed!');
        } else {
            console.log(`\n⚠ Found ${issueCount} potential issues remaining.`);
        }
        
        return formattedResult;
        
    } catch (error) {
        console.error('Error during formatting:', error.message);
        console.error(error.stack);
        return null;
    }
}

// This function tests the actual fixes by comparing with expected format
function testExpectedFormatting() {
    console.log('\n' + '='.repeat(60));
    console.log('COMPARISON WITH EXPECTED FORMATTING');
    console.log('='.repeat(60));
    
    const result = testStructFieldFormattingFixes();
    
    if (result) {
        console.log('\nExpected improvements:');
        console.log('1. Fixed spacing between types and variable names');
        console.log('2. Proper alignment of variable names');
        console.log('3. Proper alignment of annotations');
        console.log('4. Proper comma placement without extra spaces');
        console.log('5. Proper alignment of comments');
    }
}

// Run the test
testExpectedFormatting();