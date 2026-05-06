// Test file for include navigation
struct SharedStruct {
    1: required string name,
    2: optional i32 value
}

enum SharedEnum {
    OPTION1 = 1,
    OPTION2 = 2
}


service SharedService {}
