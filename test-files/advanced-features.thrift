/**
 * 高级特性示例文件 - 展示流式传输、交互模式等实验性语法
 * 注意：这些特性可能尚未在官方Thrift规范中实现
 */

namespace cpp thrift.test
namespace java thrift.test
namespace py thrift.test

/**
 * 流式传输示例
 * 用于处理大量数据或实时数据流
 */
service StreamService {
    // 单向流：客户端到服务器的流
    stream<i32> uploadData(1: string sessionId)
    
    // 单向流：服务器到客户端的流  
    stream<string> downloadLogs(1: i32 count)
    
    // 双向流：客户端和服务器之间的双向通信
    stream<Message> chat(1: stream<Message> messages)
}

/**
 * Sink模式示例
 * 用于数据收集和处理
 */
service DataSinkService {
    // Sink接收器：收集数据到指定目标
    sink<LogEntry> collectLogs(1: string category)
    
    // Sink与stream结合：处理和转发数据
    sink<Metric> processMetrics(1: stream<RawMetric> input)
}

/**
 * 交互模式示例
 * 用于有状态的会话通信
 */
interaction Calculator {
    // 交互式方法调用
    i32 add(1: i32 a, 2: i32 b)
    i32 subtract(1: i32 a, 2: i32 b)
    i32 multiply(1: i32 a, 2: i32 b)
    
    // 状态保持的操作
    void setValue(1: i32 value)
    i32 getValue()
}

/**
 * Performs语法示例
 * 用于声明服务之间的依赖关系
 */
service DataService {
    // 声明此服务执行特定的交互
    performs Calculator calc
    
    // 声明服务执行多个操作
    performs DataProcessor processor
    performs Validator validator
}

/**
 * Reference类型示例
 * 用于引用其他服务或交互
 */
struct ServiceReference {
    1: required reference<DataService> dataService
    2: optional reference<Calculator> calculator
}

/**
 * 支持的数据结构
 */
struct Message {
    1: required string id
    2: required string content
    3: required i64 timestamp
    4: optional map<string, string> metadata
}

struct LogEntry {
    1: required string level
    2: required string message
    3: required i64 timestamp
    4: optional string source
}

struct Metric {
    1: required string name
    2: required double value
    3: required i64 timestamp
    4: optional map<string, string> tags
}

struct RawMetric {
    1: required string rawData
    2: required i64 receivedAt
}

// 枚举定义
enum ServiceStatus {
    UNKNOWN = 0,
    READY = 1,
    PROCESSING = 2,
    ERROR = 3,
    SHUTDOWN = 4
}

// 异常定义
exception StreamException {
    1: required string message
    2: optional i32 errorCode
}

exception SinkException {
    1: required string reason
    2: optional string target
}

// 常量定义
const string DEFAULT_STREAM_ID = "default-stream"
const i32 MAX_STREAM_SIZE = 1000000

// 命名空间注解
@namespace{"cpp": "thrift::advanced"}
@namespace{"java": "org.apache.thrift.advanced"}
@namespace{"py": "thrift.advanced"}

// 服务注解
@ServiceMetadata{
    version = "1.0.0",
    description = "Advanced Thrift Features Demo"
}
service AdvancedService {
    
    // 传统方法
    string ping()
    
    // 带注解的方法
    @MethodMetadata{
        deprecated = false,
        timeout = 30000
    }
    stream<DataChunk> getDataStream(1: string query)
    
    // 复杂交互方法
    interaction<Calculator> createCalculator(1: string sessionId)
}

// 交互注解
@InteractionMetadata{
    stateful = true,
    timeout = 60000
}
interaction StatefulCalculator extends Calculator {
    void reset()
    void setMemory(1: i64 value)
    i64 getMemory()
}

/**
 * 复杂类型定义
 */
struct DataChunk {
    1: required i32 chunkId
    2: required binary data
    3: required bool isLast
    4: optional i32 checksum
}

// 服务之间的引用关系
struct ServiceRegistry {
    1: required map<string, reference<Service>> services
    2: required map<string, reference<interaction>> interactions
}

// 未定义的服务（用于演示引用）
service Service {
    string getName()
}

// 未定义的处理器
service DataProcessor {
    DataChunk process(1: DataChunk input)
}

// 未定义的验证器
service Validator {
    bool validate(1: binary data)
}