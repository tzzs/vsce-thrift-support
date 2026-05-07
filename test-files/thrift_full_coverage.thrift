/**
 * Thrift full feature coverage test file
 * Covers: namespace, include, typedef, enum, const, struct, union, exception,
 *         service (with extends, oneway, throws, stream/sink),
 *         containers, annotations, default values, comments
 */

// === Namespace definitions ===
namespace cpp my.company.project
namespace java com.mycompany.project
namespace py my_project
namespace js my.project

// === Include other files ===
include "common_types.thrift"

// === Typedefs ===
typedef i64 LongId
typedef map<string, list<i32>> StrToIntListMap
typedef StrToIntListMap AliasMap

// === Constants ===
const double PI = 3.1415926
const list<i32> NUMS = [1, 2, 3, 4]
const map<string, string> DICT = {"a": "b", "c": "d"}
const StrToIntListMap COMPLEX_CONST = {
  "group1": [1, 2, 3],
  "group2": [10, 20, 30],
}
const string QUOTE_TEST = "This is a string with = signs and commas, ok?"
const bool FLAG = true

// === Enumerations ===
enum Status {
  OK = 0,
  WARN = 1,
  ERROR = 2,
  UNKNOWN = -1,
}

// === Structs ===
struct User {
  1: required LongId id = 1001,           // default value
  2: optional string name (json_name="user_name"),
  3: i32 age,
  4: list<string> tags = ["thrift", "test"],
  5: map<string, i32> scores = {"math": 95, "eng": 88},
  6: bool active = true
  // comment: test comment inside struct
}

/**
 * Union — only one field can be set at a time
 */
union Value {
  1: string text,
  2: i64 number,
  3: bool flag
}

/**
 * Exception example with inheritance
 */
exception BaseError {
  1: string message
}

exception DetailedError extends BaseError {
  2: i32 code,
  3: optional string context
}

// === Containers and nested definitions ===
struct NestedContainer {
  1: list<map<string, set<i32>>> deepContainer
  2: map<string, list<User>> userGroups
  3: set<Status> statusSet = [OK, WARN]
}

/**
 * Service definitions
 */
service BaseService {
  // Simple RPC
  void ping(),

  // Function with return and throws
  string echo(1:string msg) throws (1: DetailedError err),

  // Oneway function
  oneway void notify(1:string topic, 2:string message)
}

/**
 * Advanced service with extends and stream/sink
 */
service AdvancedService extends BaseService {

  // Standard function with annotations
  i32 add(
    1:i32 a,
    2:i32 b
  ) (description = "simple addition"),

  // Streaming function
  stream<i64> fetchLargeData(1: string query),

  // Sink function
  sink<string, i32> uploadChunks(1: list<string> chunks),

  // Function using typedef and default parameter
  list<User> findUsers(1: string name = "anonymous"),

  // Function throwing multiple exceptions
  void riskyOp() throws (
    1: BaseError base,
    2: DetailedError detail
  )
}

/**
 * Example annotation usage at multiple levels
 */
struct AnnotatedStruct (
  cpp.virtual = "true",
  java.annotations = "@Data"
) {
  1: string field (accessor = "getField", json_name = "f")
}

/**
 * Complex nested typedef and default values
 */
typedef list<list<map<string, i32>>> DeepType

struct DeepDefault {
  1: DeepType complexField = [[{"a": 1, "b": 2}], [{"x": 9}]]
}

/**
 * Reserved keywords and ID validation edge cases
 */
struct EdgeCase {
  1: i32 id = 0,
  2: i32 _private,  // underscore prefix
  3: string default = "not keyword",
  4: map<string, map<string, i32>> trickyMap = {"outer": {"inner": 1}},
  5: optional Value unionField
}

/**
 * Testing comments and annotations variety
 */
// comment style test
# shell style comment
/* C-style multi-line comment */
struct Commented {
  1: string note // inline comment
}

/**
 * File-level annotations (rare)
 */
annotations = {
  "source" : "thrift_full_coverage",
  "version" : "1.0"
}
