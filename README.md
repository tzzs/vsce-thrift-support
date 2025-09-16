# Thrift Support for VSCode

[English](./README.en.md) | [中文](./README.md)

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/tanzz.thrift-support?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/tanzz.thrift-support?label=Installs)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Open VSX](https://img.shields.io/open-vsx/v/tanzz/thrift-support?label=Open%20VSX)](https://open-vsx.org/extension/tanzz/thrift-support)
[![OVSX Downloads](https://img.shields.io/open-vsx/dt/tanzz/thrift-support?label=OVSX%20Downloads)](https://open-vsx.org/extension/tanzz/thrift-support)
[![CI](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml/badge.svg?branch=master)](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml)

一个为 VSCode 提供 Apache Thrift 文件完整支持的扩展，包含语法高亮、代码格式化和导航功能。

> 开发者请阅读开发指南：见仓库根目录的 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 🚀 功能特性

### 语法高亮
- 完整的 Thrift 语法支持，包括关键字、数据类型、字符串、注释和数字字面量
- 支持所有 Thrift 原生类型和容器类型
- 智能的语法着色，提升代码可读性

### 代码格式化
- **文档格式化**：一键格式化整个 Thrift 文件
- **选择格式化**：格式化选中的代码块
- **智能对齐**：自动对齐字段类型、字段名和注释
- **可配置选项**：支持自定义缩进、行长度等格式化规则

### 代码导航
- **跳转到定义**：快速导航到类型定义
- **包含文件解析**：支持跟踪 `include` 语句
- **工作区搜索**：在整个工作区中查找定义

## 📦 安装

1. 打开 VSCode
2. 进入扩展市场 (`Ctrl+Shift+X`)
3. 搜索 "Thrift Support"
4. 点击安装

## 🔧 使用方法

### 格式化代码
- **格式化文档**：`Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Shift+I` (Mac)
- **格式化选择**：选中代码后使用 `Ctrl+K Ctrl+F` (Windows/Linux) 或 `Cmd+K Cmd+F` (Mac)
- **命令面板**：
  - `Thrift: Format Document`
  - `Thrift: Format Selection`

> 发布命名空间：`tanzz`（VS Marketplace 与 Open VSX 均使用此命名空间）

### 代码导航
- **跳转到定义**：`F12` 或 `Ctrl+点击` 类型名
- **查看定义**：`Alt+F12`

### 配置选项

在 VSCode 设置中可以配置以下选项：

```json
{
  "thrift.format.trailingComma": "preserve", // "preserve" | "add" | "remove"
  "thrift.format.alignTypes": true,
  "thrift.format.alignNames": true,
  "thrift.format.alignAssignments": true,
  "thrift.format.alignAnnotations": true,
  "thrift.format.alignComments": true,
  "thrift.format.indentSize": 4,
  "thrift.format.maxLineLength": 100,
  "thrift.format.collectionStyle": "preserve" // "preserve" | "multiline" | "auto"
}
```

## 📝 格式化示例

### 格式化前：
```thrift
struct User{
1:required string name
2:optional i32 age,
3: string email // user email
}
```

### 格式化后：
```thrift
struct User {
    1:   required string name,
    2:   optional i32    age,
    3:   string          email  // user email
}
```

## 🐛 问题反馈

如果您遇到任何问题或有功能建议，请通过以下方式反馈：

1. **GitHub Issues**：在 [项目仓库](https://github.com/tzzs/vsce-thrift-support) 中创建 Issue
2. **描述问题**：请详细描述遇到的问题，包括：
   - VSCode 版本
   - 扩展版本
   - 重现步骤
   - 期望行为
   - 实际行为
3. **提供示例**：如果可能，请提供相关的 Thrift 代码示例

## 🤝 贡献指南

我们欢迎社区贡献！如果您想为项目做出贡献：

### 贡献方式
1. **报告 Bug**：发现问题请及时报告
2. **功能建议**：提出新功能的想法和建议
3. **代码贡献**：提交 Pull Request
4. **文档改进**：帮助完善文档

### 开发环境
开发相关内容已迁移至 [DEVELOPMENT.md](DEVELOPMENT.md)，请前往查看最新要求与步骤（包括 Node.js 版本、构建、测试与发布流程）。

### 提交 Pull Request
1. 创建功能分支：`git checkout -b feature/your-feature`
2. 提交更改：`git commit -m "Add your feature"`
3. 推送分支：`git push origin feature/your-feature`
4. 创建 Pull Request

## 📄 许可证

本扩展基于 MIT 许可证开源。

## 🔄 更新日志

完整的更新记录请查看 CHANGELOG：
- 本地：[CHANGELOG.md](CHANGELOG.md)
- GitHub：https://github.com/tzzs/vsce-thrift-support/blob/master/CHANGELOG.md

## 🔗 相关链接

- **GitHub 仓库**：[https://github.com/tzzs/vsce-thrift-support](https://github.com/tzzs/vsce-thrift-support)
- **问题反馈**：[GitHub Issues](https://github.com/tzzs/vsce-thrift-support/issues)
- **功能请求**：[GitHub Discussions](https://github.com/tzzs/vsce-thrift-support/discussions)
- **CI 状态**：[Publish Workflow](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml)

---

**享受使用 Thrift Support 扩展！** 如果觉得有用，请在 [GitHub](https://github.com/tzzs/vsce-thrift-support) 给我们一个 ⭐️