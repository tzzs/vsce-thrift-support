// 测试Thrift IDL所有特性

// 包含指令
include "common.thrift"
cpp_include "common.h"

// 命名空间
namespace cpp example.service
namespace java com.example.service
namespace py example.service
namespace php Example.Service
namespace js example.service
namespace rb Example::Service
namespace csharp Example.Service
namespace go example/service
namespace swift ExampleService

// 注释测试
// 行注释
# 另一种行注释
/* 块注释 */

// 基本数据类型
typedef i8 byte
typedef i16 short
typedef i32 int
typedef i64 long
typedef double float
typedef string str
typedef binary data
typedef uuid id
typedef slist string_list
typedef senum string_enum

// 容器类型
typedef list<i32> IntList
typedef set<string> StringSet
typedef map<string, i32> StringToIntMap

// 嵌套容器类型
typedef list<list<i32>> NestedList
typedef set<set<string>> NestedSet
typedef map<string, map<string, i32>> NestedMap
typedef list<map<string, set<i32>>> ComplexContainer

// 带有命名空间的类型引用
typedef common.CustomType ImportedType

// 枚举定义
enum Status {
  OK = 0,
  ERROR = 1,
  PENDING = 2
}

// 字符串枚举
senum Color {
  "RED",
  "GREEN",
  "BLUE"
}

// 结构体定义
struct User {
  1: required i32 id,
  2: required string name,
  3: optional string email,
  4: optional Status status = Status.OK,
  5: optional list<string> roles,
  6: optional map<string, string> metadata,
  7: optional ImportedType external_data
}

// 结构体嵌套
struct UserProfile {
  1: required User user,
  2: optional string bio,
  3: optional list<User> friends
}

// 异常定义
exception ServiceException {
  1: required i32 error_code,
  2: required string message,
  3: optional string details
}

// 联合定义
union DataValue {
  1: i32 int_value,
  2: double double_value,
  3: string string_value,
  4: bool bool_value,
  5: binary binary_value
}

// 常量定义
const i32 MAX_USERS = 1000
const string DEFAULT_NAME = "Anonymous"
const map<string, i32> DEFAULT_SETTINGS = {
  "timeout": 30,
  "retries": 3
}
const list<string> SUPPORTED_LOCALES = ["en", "zh", "fr", "de"]

// 带注释的定义
struct Config {
  1: required string name (cpp.name = "configName", java.name = "configName"),
  2: optional i32 timeout (default = 30),
  3: optional bool enabled = true
}

// 服务定义
service UserService {
  // 基本方法
  bool ping(),
  
  // 带参数和返回值的方法
  User getUser(1: i32 user_id) throws (1: ServiceException error),
  
  // 带可选参数的方法
  bool updateUser(1: required User user, 2: optional bool validate = true),
  
  // 批量操作
  list<User> getUsers(1: list<i32> user_ids),
  
  // 异步方法
  oneway void notifyUser(1: i32 user_id, 2: string message),
  
  // 流式方法
  stream<i32> getUserIds(),
  sink<string> receiveMessages(1: i32 user_id)
}

// 服务继承
service ExtendedUserService extends UserService {
  // 扩展方法
  UserProfile getUserProfile(1: i32 user_id),
  bool updateUserProfile(1: required UserProfile profile)
}

// 使用各种修饰符
struct AdvancedStruct {
  1: required i32 id,
  2: optional string name,
  3: optional i64 timestamp (readonly = true),
  4: optional string hash (final = true)
}