# Thrift高级特性支持

## 概述

本扩展为Apache Thrift IDL提供了高级语法特性的支持，包括流式传输(stream)、数据收集(sink)、交互模式(interaction)和服务依赖(performs)等实验性语法。

## 新增特性

### 1. 流式传输 (Stream)
```thrift
service StreamService {
    // 单向流：客户端到服务器
    stream<i32> uploadData(1: string sessionId)
    
    // 单向流：服务器到客户端
    stream<string> downloadLogs(1: i32 count)
    
    // 双向流
    stream<Message> chat(1: stream<Message> messages)
}
```

### 2. 数据收集 (Sink)
```thrift
service DataSinkService {
    // Sink接收器
    sink<LogEntry> collectLogs(1: string category)
    
    // Sink与stream结合
    sink<Metric> processMetrics(1: stream<RawMetric> input)
}
```

### 3. 交互模式 (Interaction)
```thrift
// 有状态的交互定义
interaction Calculator {
    i32 add(1: i32 a, 2: i32 b)
    i32 subtract(1: i32 a, 2: i32 b)
    void setValue(1: i32 value)
    i32 getValue()
}
```

### 4. 服务依赖 (Performs)
```thrift
service DataService {
    // 声明服务执行的交互
    performs Calculator calc
    performs DataProcessor processor
}
```

### 5. 引用类型 (Reference)
```thrift
struct ServiceReference {
    1: required reference<DataService> dataService
    2: optional reference<Calculator> calculator
}
```

## 语法高亮

扩展为这些高级特性提供了专门的语法高亮：

- 🔵 **stream** - 流式传输关键字
- 🟢 **sink** - 数据收集关键字  
- 🟡 **interaction** - 交互模式关键字
- 🟠 **performs** - 服务依赖关键字
- 🟣 **reference** - 引用类型关键字

## 代码补全

在输入时，扩展会自动补全这些高级特性关键字：

- 输入 `str` → 自动补全 `stream`
- 输入 `sin` → 自动补全 `sink` 
- 输入 `int` → 自动补全 `interaction`
- 输入 `per` → 自动补全 `performs`
- 输入 `ref` → 自动补全 `reference`

## 示例文件

查看 `test-files/advanced-features.thrift` 获取完整的语法示例。

## 注意事项

⚠️ **重要提醒**：这些高级特性目前处于实验阶段，可能尚未在官方的Apache Thrift编译器中得到完全支持。它们主要用于：

1. **前瞻性开发** - 为未来Thrift版本做准备
2. **原型设计** - 测试和验证新的通信模式
3. **概念验证** - 展示可能的语法扩展

在使用这些特性时，请确保：
- 了解目标Thrift运行时的支持情况
- 进行充分的测试验证
- 考虑向后兼容性

## 配置选项

扩展提供了两个语法配置文件：

- `thrift.tmLanguage.json` - 标准Thrift语法（默认）
- `thrift.tmLanguage-enhanced.json` - 增强版语法（包含高级特性）

您可以通过VS Code的设置切换不同的语法高亮模式。