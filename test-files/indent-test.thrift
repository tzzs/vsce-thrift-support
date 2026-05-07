// 测试注释支持：// 注释
# 测试注释支持：# 注释
/* 测试注释支持：块注释 */

// 测试括号匹配：<> 用于泛型
struct GenericTest {
    1: list<string> stringList
    2: map<i32, string> intToStringMap
    3: set<double> doubleSet
}

// 测试缩进规则：struct内部成员
struct Person {
    1: required string name
    2: optional i32 age
    3: required list<Address> addresses
}

// 测试缩进规则：union内部成员
union DataValue {
    1: string stringValue
    2: i32 intValue
    3: double doubleValue
    4: list<string> stringArray
}

// 测试缩进规则：service内部成员
service UserService {
    // 基本方法
    string getUserName(1: i32 userId)
    
    // 复杂方法
    list<User> getUsers(1: list<i32> userIds)
    
    // 流式方法
    stream<Event> subscribeEvents(1: string topic)
}

// 测试缩进规则：exception内部成员
exception ValidationError {
    1: required string fieldName
    2: required string errorMessage
    3: optional map<string, string> details
}

// 测试缩进规则：enum内部成员
enum Status {
    UNKNOWN = 0
    ACTIVE = 1
    INACTIVE = 2
    SUSPENDED = 3
}

// 测试缩进规则：interaction内部成员
interaction Calculator {
    i32 add(1: i32 a, 2: i32 b)
    i32 subtract(1: i32 a, 2: i32 b)
    i32 multiply(1: i32 a, 2: i32 b)
}

// 测试多层容器类型嵌套
struct ComplexData {
    1: list<map<string, list<i32>>> nestedStructure
    2: map<string, map<i32, set<double>>> complexMapping
    3: set<list<map<i32, string>>> complicatedSet
}