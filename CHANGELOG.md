# Changelog

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
