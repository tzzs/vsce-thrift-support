
namespace js StreamingTest

struct Message {
  1: string content,
  2: i64 timestamp
}

struct LogEntry {
  1: string level,
  2: string message,
  3: i64 timestamp
}

struct RawMetric {
  1: string name,
  2: double value,
  3: map<string, string> tags
}

struct Metric {
  1: string name,
  2: double value,
  3: map<string, string> labels
}

service StreamService {
  // 单向流：客户端到服务器
  stream<i32> uploadData(1: string sessionId)
  
  // 单向流：服务器到客户端
  stream<string> downloadLogs(1: i32 count)
  
  // 双向流
  stream<Message> chat(1: stream<Message> messages)
}

service DataSinkService {
  // Sink接收器
  sink<LogEntry> collectLogs(1: string category)
  
  // Sink与stream结合
  sink<Metric> processMetrics(1: stream<RawMetric> input)
}
