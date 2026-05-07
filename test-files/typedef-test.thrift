// 测试typedef中嵌套类型被截断的问题
typedef list<map<string, string>> DeepType
typedef map<string, list<i32>> ComplexType
typedef set<list<map<string, i64>>> VeryComplexType

// 测试结构体中的嵌套类型
struct Example {
  1: DeepType field1
  2: ComplexType field2
  3: VeryComplexType field3
}