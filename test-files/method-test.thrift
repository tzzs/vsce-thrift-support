// 测试服务中的方法定义
service TestService {
    // 简单方法
    void ping(),
    
    // 带参数的方法
    i32 add(1: i32 num1, 2: i32 num2),
    
    // 带嵌套类型参数的方法
    list<string> getNames(1: map<string, list<i32>> userMap),
    
    // 带复杂嵌套类型参数的方法
    map<string, set<i64>> getComplexData(1: list<map<string, set<i64>>> dataList),
    
    // 带throws的方法
    string processData(1: string input) throws (1: NotFoundException ex),
    
    // oneway方法
    oneway void log(1: string message)
}

// 异常定义
exception NotFoundException {
    1: string message
}