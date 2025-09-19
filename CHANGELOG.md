# Changelog

## [Unreleased]

### 开发工具升级
- 升级构建工具从 `vsce` 2.15.0 到 `@vscode/vsce` 3.6.0
- 更新 package.json 脚本命令使用 `npx @vscode/vsce`
- 新版本提供更好的安全扫描和错误处理

## [0.2.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.1.4...v0.2.0) (2025-09-16)


### Features

* **tests:** add struct annotation alignment test cases ([5496214](https://github.com/tzzs/vsce-thrift-support/commit/5496214f9303b06d92dce91a740ec4e08b705e16))
* **thrift:** add annotation alignment formatting and tests ([61d13e8](https://github.com/tzzs/vsce-thrift-support/commit/61d13e8b36c2cf679a96a5385221d8cd687d7c71))


### Bug Fixes

* **formatter:** ensure tight comma placement in struct fields ([62172d5](https://github.com/tzzs/vsce-thrift-support/commit/62172d5d0a57c8c0bcff3f91eccbe7ec6de1efeb))

## 0.1.5 - 2025-09-16

新增
- 新增配置项 thrift.format.alignStructAnnotations，用于控制结构体字段注解的对齐。

改进
- 实现结构体字段注解对齐的格式化逻辑，并与类型/字段名/注释等对齐选项组合时保持稳定。
- 支持 range 格式化上下文（range format context）。

回归与测试
- 新增对 test-files/main.thrift 的回归测试，确保注解列对齐时尾随逗号紧跟注解文本、逗号前无多余空格；并更新尾随逗号相关测试覆盖（preserve/add/remove）。
- 增补结构体、枚举及区间（range）格式化在多种组合配置下的测试用例。

验证
- 通过 npm run build 与 npm run test:all 全量测试。

## 0.1.2 - 2025-09-13

修复
- 块注释缩进与星号列对齐，使注释与后续代码缩进一致且“*”列对齐。
- 保持 const 语句与其后行注释的原始顺序，避免注释被移动到 const 上方。

验证
- 通过 npm run build 与针对关键片段的手动验证。

## 0.1.1 - 2025-09-13

修复
- 移除 src/formatter.ts 中遗留的差异标记（+/-），修复导致的大量 TypeScript 语法错误（如缺少分号、意外关键字等）。
- 修正 parseConstField 的位置与实现，确保常量解析在类内正确工作。
- 完善尾随逗号处理逻辑：结构体与枚举在 preserve / add / remove 三种模式下行为一致，测试覆盖通过。

改进
- 完善常量中集合（list/map/set/object）的格式化策略：
  - collectionStyle=multiline：内联集合强制展开为多行。
  - collectionStyle=auto：当整行（含注释）超过 maxLineLength 时自动展开为多行。
  - 多行集合项对齐与行内注释对齐优化，提升可读性。
- 对齐宽度计算更稳健（使用已调整字段集进行对齐计算），避免边界情况下的错位。

验证
- 通过 npm run build 编译与 npm run test:all 全量测试（包含常量集合、多行对齐、尾随逗号与缩进宽度等测试）。

备注
- 配置项 collectionStyle（preserve/multiline/auto）与 maxLineLength 对“常量集合是否展开”影响更直观，建议结合团队规范使用。

## 0.1.0 - 2025-09-13
- 初始版本：提供 Thrift 语法高亮、格式化与基础导航能力。
