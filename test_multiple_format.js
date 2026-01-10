const {ThriftFormatter} = require('./out/formatter');

// Test case that demonstrates the multiple formatting issue
const originalCode = `// Struct definition with various field types - 用户信息结构体
struct User {
    1:  required UserId             id,                                // 用户唯一标识
    2:  required string             name  (go.tag='json:"name"'),      // 用户姓名
    3:  optional Email              email (go.tag="xx:\"len($)>0\""),  // 邮箱地址
    4:  optional i32                age,                               // 年龄
    5:  optional Status             status = Status.ACTIVE,            // 用户状态，默认为活跃
    6:  optional list<string>       tags,                              // 用户标签列表
    7:  optional map<string,string> metadata,                          // 用户元数据
    8:  optional bool               isVerified = false,                // 是否已验证，默认未验证
    9:  optional double             score = 0.0,                       // 用户评分，默认0.0
    10: optional binary             avatar                             // 用户头像二进制数据
}`;

console.log('Original code:');
console.log(originalCode);
console.log('\n---');

const formatter = new ThriftFormatter();

// Format once
let formattedOnce = formatter.format(originalCode);
console.log('Formatted once:');
console.log(formattedOnce);
console.log('\n---');

// Format twice (apply formatter to already formatted content)
let formattedTwice = formatter.format(formattedOnce);
console.log('Formatted twice:');
console.log(formattedTwice);
console.log('\n---');

// Check if they are the same
const areEqual = formattedOnce === formattedTwice;
console.log('Are formatted once and twice the same?', areEqual);

if (!areEqual) {
    console.log('ERROR: Multiple formatting produces different results!');
    console.log('Diff length once:', formattedOnce.length);
    console.log('Diff length twice:', formattedTwice.length);
} else {
    console.log('SUCCESS: Multiple formatting produces the same result (idempotent)');
}