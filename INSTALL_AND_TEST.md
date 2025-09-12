# Thrift Support 插件安装和测试指南

## 🔧 最新修复 (2025-01-13)

**修复了 `RangeError: Invalid count value: -2` 错误**
- 修复了格式化器中缩进级别可能变为负数的问题
- 添加了边界情况保护，确保 `String.repeat()` 不会接收负数参数
- 提升了格式化器的稳定性和容错能力

**如果您之前遇到格式化错误，请重新安装最新版本！**

## 安装步骤

1. **卸载旧版本插件**（如果已安装）
   - 在VSCode中按 `Ctrl+Shift+X` 打开扩展面板
   - 搜索 "Thrift Support"
   - 如果找到已安装的版本，点击卸载
   - 重启VSCode

2. **安装新版本插件**
   ```bash
   code --install-extension thrift-support-0.1.0.vsix
   ```
   或者在VSCode中：
   - 按 `Ctrl+Shift+P` 打开命令面板
   - 输入 "Extensions: Install from VSIX..."
   - 选择 `thrift-support-0.1.0.vsix` 文件

3. **重启VSCode**
   - 完全关闭VSCode
   - 重新打开VSCode

## 测试格式化功能

### 方法1：使用快捷键
1. 打开 `example.thrift` 文件
2. 确保文件语言模式显示为 "Thrift"（右下角状态栏）
3. 按 `Shift+Alt+F` 格式化整个文档
4. 或者选中部分代码后按 `Ctrl+K Ctrl+F` 格式化选中内容

### 方法2：使用命令面板
1. 打开 `example.thrift` 文件
2. 按 `Ctrl+Shift+P` 打开命令面板
3. 输入 "Format Document" 并选择
4. 或者输入 "Thrift: Format Document"

### 方法3：使用右键菜单
1. 打开 `example.thrift` 文件
2. 右键点击编辑器
3. 选择 "Format Document" 或 "Format Selection"

## 预期的格式化效果

格式化前：
```thrift
struct User {
  1: required UserId     id,
  2: required string   name,
  3: optional Email    email,
  4: optional i32      age,
  5: optional Status   status    = Status.ACTIVE,
  6: optional list<string> tags,
  7: optional map<string, string> metadata,
  8: optional bool     isVerified= false,
  9: optional double   score     = 0.0,
  10: optional binary   avatar,
}
```

格式化后：
```thrift
struct User {
  1: required UserId   id        ,
  2: required string   name      ,
  3: optional Email    email     ,
  4: optional i32      age       ,
  5: optional Status   status     = Status.ACTIVE,
  6: optional list      <string> tags,
  7: optional map       <string, string> metadata,
  8: optional bool     isVerified = false,
  9: optional double   score      = 0.0,
  10: optional binary   avatar    ,
}
```

## 故障排除

### 如果格式化没有效果：

1. **检查文件语言模式**
   - 确保右下角状态栏显示 "Thrift"
   - 如果不是，点击语言模式并选择 "Thrift"

2. **检查插件是否激活**
   - 按 `Ctrl+Shift+P`
   - 输入 "Developer: Reload Window" 重新加载窗口
   - 查看输出面板是否有 "Thrift Support extension is now active!" 消息

3. **检查VSCode设置**
   - 打开设置 (`Ctrl+,`)
   - 搜索 "format on save" 确保启用
   - 搜索 "thrift.format" 查看格式化选项

4. **查看开发者控制台**
   - 按 `Ctrl+Shift+I` 打开开发者工具
   - 查看控制台是否有错误信息

5. **手动触发格式化**
   - 按 `Ctrl+Shift+P`
   - 输入 "Thrift: Format Document"
   - 如果命令不存在，说明插件未正确加载

### 如果仍然无法工作：

1. **完全重新安装**
   ```bash
   # 卸载插件
   code --uninstall-extension thrift-support
   
   # 重启VSCode
   
   # 重新安装
   code --install-extension thrift-support-0.1.0.vsix
   ```

2. **检查VSCode版本**
   - 确保VSCode版本 >= 1.74.0
   - 帮助 -> 关于 查看版本信息

3. **创建最小测试文件**
   - 创建新文件 `test.thrift`
   - 输入简单的struct定义
   - 保存并尝试格式化

## 配置选项

在VSCode设置中可以配置以下选项：

- `thrift.format.trailingComma`: 是否添加尾随逗号（默认：true）
- `thrift.format.alignTypes`: 是否对齐字段类型（默认：true）
- `thrift.format.alignFieldNames`: 是否对齐字段名（默认：true）
- `thrift.format.alignComments`: 是否对齐注释（默认：true）
- `thrift.format.indentSize`: 缩进大小（默认：2）
- `thrift.format.maxLineLength`: 最大行长度（默认：100）

## 验证插件功能

运行以下命令验证格式化器逻辑：
```bash
node simple-test.js
```

这将显示格式化器的内部工作情况和预期输出。