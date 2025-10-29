# Test file for new Thrift IDL keywords

# Language-specific namespace scopes
cpp_include "test.h"
namespace cpp test
namespace py test
namespace java test
namespace go test
namespace js test
namespace php test
namespace rb test
namespace lua test
namespace netstd test
namespace perl test
namespace delphi test
namespace haxe test
namespace st test
namespace xsd test

# Service with new keywords
service TestService {
    // Basic types and containers
    void testMethod(1: string param),
    
    // Stream and sink
    stream<string> getStream(),
    sink<i32, string> getSink(),
    
    // Interaction and performs
    interaction TestInteraction {
        string processData(1: i32 data)
    }
    
    performs TestInteraction getInteraction()
}

# Struct with optional field
struct TestStruct {
    1: required string name,
    2: optional i32 age,
    3: optional string description
}

# Reserved keywords that should be highlighted
const string BEGIN = "start"
const string END = "end"
const string CLASS = "class"
const string FUNCTION = "function"
const string PUBLIC = "public"
const string PRIVATE = "private"
const string PROTECTED = "protected"
const string STATIC = "static"
const string ABSTRACT = "abstract"
const string FINAL = "final"
const string NATIVE = "native"
const string SYNCHRONIZED = "synchronized"
const string VOLATILE = "volatile"
const string TRANSIENT = "transient"
const string STRICTFP = "strictfp"
const string PACKAGE = "package"
const string IMPORT = "import"
const string THROWS = "throws"
const string THROW = "throw"
const string TRY = "try"
const string CATCH = "catch"
const string FINALLY = "finally"
const string IF = "if"
const string ELSE = "else"
const string FOR = "for"
const string WHILE = "while"
const string DO = "do"
const string SWITCH = "switch"
const string CASE = "case"
const string DEFAULT = "default"
const string BREAK = "break"
const string CONTINUE = "continue"
const string RETURN = "return"
const string TRUE = "true"
const string FALSE = "false"
const string NULL = "null"
const string THIS = "this"
const string SUPER = "super"
const string EXTENDS = "extends"
const string IMPLEMENTS = "implements"
const string INTERFACE = "interface"
const string ENUM = "enum"
const string CLASS = "class"
const string CONST = "const"
const string GOTO = "goto"
const string INSTANCEOF = "instanceof"
const string NEW = "new"
const string ASSERT = "assert"
const string BYTE = "byte"
const string SHORT = "short"
const string INT = "int"
const string LONG = "long"
const string FLOAT = "float"
const string DOUBLE = "double"
const string BOOLEAN = "boolean"
const string CHAR = "char"