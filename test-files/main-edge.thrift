include "shared.thrift"
include "shared-common.thrift"
include "shared.thrift" // duplicate include

struct Edge {
  1: required shared.SharedStruct a,
  2: optional list<shared.SharedStruct> listA,
  3: optional map<i32, shared.SharedEnum> mapA,
}