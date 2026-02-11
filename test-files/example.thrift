/*
 * Example Thrift file to demonstrate the extension features
 * This file follows Apache Thrift coding standards
 */

namespace java com.example.thrift
namespace py example.thrift

include "./shared.thrift"

// Basic data types demonstration
// 用户ID类型定义
typedef i32 UserId
// 邮箱地址类型定义
typedef string Email

// Enum definition - 用户状态枚举
enum Status {
    ACTIVE    = 1, // 活跃状态
    INACTIVE  = 2, // 非活跃状态
    PENDING   = 3, // 待审核状态
    SUSPENDED = 4  // 暂停状态
    A         = 9  # 测试A
    B         = 19 # 测试B
    C         = -1 # 测试C
}

// Struct definition with various field types - 用户信息结构体
struct User {
    1: required UserId id, // 用户唯一标识

    2:  required string             name            (go.tag='json:"name"'),     // 用户姓名
    3:  optional Email              email      = "" (go.tag="xx:\"len($)>0\""), // 邮箱地址
    4:  optional i32                age,                                        // 年龄
    5:  optional Status             status     = Status.ACTIVE,                 // 用户状态，默认为活跃
    6:  optional list<string>       tags,                                       // 用户标签列表
    7:  optional map<string,string> metadata,                                   // 用户元数据
    8:  optional bool               isVerified = false,                         // 是否已验证，默认未验证
    9:  optional double             score      = 0.0,                           // 用户评分，默认0.0
    10: optional binary             avatar                                      //用户头像二进制数据
}

/**
 * Test2 struct
 */
struct Test2 {
    1: required i32    f1,         # 123123
    2: optional string F2URL = "", #测试f2
    3: optional i32    f3    = 0,  # ())
}

// Union definition - 搜索条件联合体
union SearchCriteria {
    1: string       name,  // 按姓名搜索
    2: Email        email, // 按邮箱搜索
    3: UserId       id,    // 按用户ID搜索
    4: list<string> tags   // 按标签列表搜索
}

// Exception definition - 异常定义
// 用户未找到异常
exception UserNotFoundException {
    1: required string message,        // 错误消息
    2: optional i32    errorCode = 404 // 错误代码，默认404
}

// 数据验证异常
exception ValidationException {
    1: required string             message,    // 错误消息
    2: required map<string,string> fieldErrors // 字段错误映射
}

// Service definition
service UserService extends shared.SharedService {
    /**
     * Create a new user
     */
    User createUser(1: User user) throws (1: ValidationException validationError),

    /**
     * Get user by ID
     */
    User getUser(1: UserId userId) throws (1: UserNotFoundException notFound),

    /**
     * Update user information
     */
    void updateUser(1: UserId userId, 2: User user)
    throws (1: UserNotFoundException notFound, 2: ValidationException validationError),

    /**
     * Delete user
     */
    oneway void deleteUser(1: UserId userId),

    /**
     * Search users by criteria
     */
    list<User> searchUsers(1: SearchCriteria criteria, 2: i32 limit = 10, 3: i32 offset = 0),

    /**
     * Get user count
     */
    i64 getUserCount(),

    /**
     * Batch get users
     */
    map<UserId,User> batchGetUsers(1: list<UserId> userIds)
}

// Constants - 常量定义
const i32             MAX_USERS           = 10000                                   // 最大用户数限制
const string          DEFAULT_NAMESPACE   = "com.example"                           // 默认命名空间
const list<string>    SUPPORTED_LANGUAGES = ["java", "python", "cpp", "javascript"] // 支持的编程语言列表 // HTTP错误代码映射表
const map<string,i32> ERROR_CODES         = {
    "NOT_FOUND": 404,        // 资源未找到
    "VALIDATION_ERROR": 400, // 数据验证错误
    "INTERNAL_ERROR": 500    // 内部服务器错误
}

enum Status {
    Init = 1  // 测试;
    End  = 20 // 初始化;
}


struct PingRequest {
    1: required string ping
}

struct PingResponse {
    1: required string pong
}

service TestService {
    // ping
    PingResponse Ping(
        1: required string traceInfo,
        2: required PingRequest request
    )
}
