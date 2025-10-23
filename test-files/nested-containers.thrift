namespace cpp test
namespace java test
namespace py test

// Test nested container types in typedefs
typedef list<i32> SimpleList
typedef map<string, i32> SimpleMap
typedef list<map<string, i32>> NestedList
typedef list<list<map<string, i32>>> DeepType
typedef set<map<string, list<i64>>> ComplexType
typedef map<string, list<set<double>>> ComplexMap
typedef set<list<map<i32, set<string>>>> VeryComplexType

// Test nested containers in struct fields
struct Example {
  1: DeepType deep
  2: ComplexType complex
  3: VeryComplexType very_complex
  4: list<list<string>> nested_lists
  5: map<string, map<i32, list<double>>> nested_maps
  6: set<list<set<string>>> nested_sets
}

// Test nested containers in function parameters
service TestService {
  list<list<map<string, i32>>> getDeepData()
  void processComplexData(1: ComplexType data)
  map<string, list<set<i64>>> transformData(1: set<list<map<i32, string>>> input)
}

// Test with annotations
typedef list<map<string, i32>> (python.immutable = "") AnnotatedNested
struct AnnotatedExample {
  1: list<set<string>> (cpp.type = "std::vector<std::set<std::string>>") annotated_field
}