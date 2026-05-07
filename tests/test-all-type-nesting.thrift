// 测试所有Thrift类型的嵌套支持

namespace cpp test
namespace java com.example.test

// 定义自定义类型
enum TestEnum {
  VALUE1 = 1,
  VALUE2 = 2
}

struct TestStruct {
  1: required string name,
  2: optional i32 id
}

// 测试各种类型嵌套的结构体
struct ComplexTypeTest {
  // 基本类型
  1: required bool flag,
  2: required byte b,
  3: required i16 shortValue,
  4: required i32 intValue,
  5: required i64 longValue,
  6: required double doubleValue,
  7: required string str,
  8: required binary data,
  9: required TestEnum enumValue,
  10: required TestStruct structValue,
  
  // 容器类型 - 单层
  11: required list<string> stringList,
  12: required set<i32> intSet,
  13: required map<string, i32> stringIntMap,
  
  // 容器类型 - 嵌套一层
  14: required list<list<string>> nestedList,
  15: required set<set<i32>> nestedSet,
  16: required map<string, list<i32>> mapToList,
  17: required map<string, map<string, i32>> nestedMap,
  18: required list<map<string, i32>> listOfMaps,
  19: required set<map<string, i32>> setOfMaps,
  
  // 容器类型 - 嵌套多层
  20: required map<map<string, i32>, map<i32, string>> complexNestedMap,
  21: required list<list<list<string>>> tripleNestedList,
  22: required map<string, list<set<i32>>> mapToListOfSets,
  
  // 包含自定义类型的嵌套容器
  23: required map<string, TestStruct> mapToStruct,
  24: required list<TestStruct> structList,
  25: required set<TestEnum> enumSet,
  26: required map<TestEnum, TestStruct> enumToStructMap,
  
  // 命名空间限定类型
  27: required test.TestStruct qualifiedStruct,
  28: required map<string, test.TestStruct> mapToQualifiedStruct,
  29: required list<com.example.test.TestStruct> javaQualifiedList,
  
  // senum 和 slist 类型
  30: required senum StringEnum,
  31: required map<senum, i32> senumMap,
  32: required slist stringListType,
  33: required map<string, slist> mapToListType,
  
  // 复杂组合
  34: required map<list<string>, set<map<TestEnum, TestStruct>>> veryComplexType
}

// 测试服务中的类型嵌套
service TestService {
  // 基本返回值
  string basicMethod(1: i32 param),
  
  // 嵌套类型参数和返回值
  map<string, list<TestStruct>> complexMethod(
    1: map<i32, string> param1,
    2: list<map<string, TestEnum>> param2
  ),
  
  // 命名空间限定类型
  test.TestStruct qualifiedMethod(1: com.example.test.TestStruct qualifiedParam)
}
