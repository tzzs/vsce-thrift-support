const assert = require('assert');
const {ThriftFormatter} = require('../../../out/formatter');

describe('struct formatting idempotency test', () => {
    it('should format the struct consistently across multiple runs', () => {
        // Test case that demonstrates the multiple formatting issue
        const originalCode = `// Struct definition with various field types - 用户信息结构体
struct User {
    1:  required UserId             id,                                // 用户唯一标识
    2:  required string             name  (go.tag='json:"name"'),      // 用户姓名
    3:  optional Email              email (go.tag="xx:\\"len($)>0\\""),  // 邮箱地址
    4:  optional i32                age,                               // 年龄
    5:  optional Status             status = Status.ACTIVE,            // 用户状态，默认为活跃
    6:  optional list<string>       tags,                              // 用户标签列表
    7:  optional map<string,string> metadata,                          // 用户元数据
    8:  optional bool               isVerified = false,                // 是否已验证，默认未验证
    9:  optional double             score = 0.0,                       // 用户评分，默认0.0
    10: optional binary             avatar                             // 用户头像二进制数据
}`;

        const formatter = new ThriftFormatter();

        // Format once
        let formattedOnce = formatter.format(originalCode, {
            trailingComma: 'preserve',
            alignTypes: true,
            alignFieldNames: true,
            alignStructDefaults: false,
            alignAnnotations: true,
            alignComments: true,
            indentSize: 4,
            insertSpaces: true
        });

        // Format twice (apply formatter to already formatted content)
        let formattedTwice = formatter.format(formattedOnce, {
            trailingComma: 'preserve',
            alignTypes: true,
            alignFieldNames: true,
            alignStructDefaults: false,
            alignAnnotations: true,
            alignComments: true,
            indentSize: 4,
            insertSpaces: true
        });

        // Format three times
        let formattedThrice = formatter.format(formattedTwice, {
            trailingComma: 'preserve',
            alignTypes: true,
            alignFieldNames: true,
            alignStructDefaults: false,
            alignAnnotations: true,
            alignComments: true,
            indentSize: 4,
            insertSpaces: true
        });

        // The formatter should be idempotent
        assert.strictEqual(
            formattedOnce,
            formattedTwice,
            'Formatter is not idempotent - format once vs twice differ'
        );
        assert.strictEqual(
            formattedTwice,
            formattedThrice,
            'Formatter is not idempotent - format twice vs thrice differ'
        );
    });
});
