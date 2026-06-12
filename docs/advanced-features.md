# Thrift高级特性支持

## 概述

本扩展跟进 Apache Thrift IDL 0.24 标准语法，并保留若干面向 fbthrift / 实验语法的编辑器支持。

## Apache Thrift IDL 0.24 Alignment

参考：

- https://thrift.apache.org/docs/idl
- https://thrift.apache.org/docs/types

当前支持状态：

| 语法/语义 | 状态 |
| --- | --- |
| `uuid` | 作为内建 BaseType 支持，覆盖 parser、diagnostics、formatter、completion、definition 排除和 grammar primitive 高亮 |
| `cpp_include` | parser 与 grammar 支持；不会进入普通 thrift include graph |
| `cpp_type` | `map/list/set cpp_type "..."<...>` 在 parser 中保留原类型文本，diagnostics 按容器内层类型校验 |
| list separators `,` 和 `;` | struct/enum/service argument/throws 等字段列表均按顶层逗号或分号拆分 |
| explicit enum values | 必须是整数 literal，且按 IDL 0.24 要求必须非负 |
| reserved keywords | grammar 覆盖主要保留字；identifier 诊断限制仍待后续安全推进 |

`stream`、`sink`、`interaction`、`performs`、`reference` 不属于 Apache Thrift IDL 0.24 标准页的核心语法。本扩展对它们的支持是实验扩展，主要用于兼容 fbthrift 风格或前瞻性 IDL。

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

## 语法配置

扩展通过 `syntaxes/thrift.tmLanguage.json` 贡献单一 TextMate grammar。当前没有单独的 enhanced grammar 切换项。
