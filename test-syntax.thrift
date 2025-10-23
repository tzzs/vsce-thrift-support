namespace java com.example

typedef list<map<string, i32>> NestedType

struct TestStruct {
  1: required string name
  2: optional list<i32> numbers
  3: map<string, string> metadata
}

enum Status {
  ACTIVE = 1
  INACTIVE = 2
}

service TestService {
  TestStruct getData(1: string id)
}