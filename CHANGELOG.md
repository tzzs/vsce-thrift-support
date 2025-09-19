# Changelog | 更新日志

## [0.3.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.2.0...v0.3.0) (2025-09-19)

### Features | 新功能

* **格式化器：** 为空行保留功能添加了全面的测试套件 ([1fc51aa](https://github.com/tzzs/vsce-thrift-support/commit/1fc51aa318f16f24615ad9a1be31c78f65ae1914))
  
  **formatter:** add comprehensive test suite for blank line preservation

* 添加 alignStructDefaults 配置项，分离结构体默认值对齐与普通等号对齐 ([f147809](https://github.com/tzzs/vsce-thrift-support/commit/f14780960d212ef7171948a3236f56ede786100c))
  
  Add alignStructDefaults configuration option to separate struct default value alignment from regular equals alignment

## [0.2.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.1.4...v0.2.0) (2025-09-16)

### Features | 新功能

* **测试：** 添加结构体注解对齐测试用例 ([5496214](https://github.com/tzzs/vsce-thrift-support/commit/5496214f9303b06d92dce91a740ec4e08b705e16))
  
  **tests:** add struct annotation alignment test cases

* **Thrift：** 添加注解对齐格式化和测试 ([61d13e8](https://github.com/tzzs/vsce-thrift-support/commit/61d13e8b36c2cf679a96a5385221d8cd687d7c71))
  
  **thrift:** add annotation alignment formatting and tests

### Bug Fixes | 错误修复

* **格式化器：** 确保结构体字段中逗号的紧密放置 ([62172d5](https://github.com/tzzs/vsce-thrift-support/commit/62172d5d0a57c8c0bcff3f91eccbe7ec6de1efeb))
  
  **formatter:** ensure tight comma placement in struct fields

## 0.1.5 - 2025-09-16

### 新增 | Added
- 新增配置项 thrift.format.alignStructAnnotations，用于控制结构体字段注解的对齐。
  
  Added configuration option thrift.format.alignStructAnnotations to control struct field annotation alignment.

### 改进 | Improved
- 实现结构体字段注解对齐的格式化逻辑，并与类型/字段名/注释等对齐选项组合时保持稳定。
  
  Implemented struct field annotation alignment formatting logic, maintaining stability when combined with type/field name/comment alignment options.

- 支持 range 格式化上下文（range format context）。
  
  Support for range format context.

### 回归与测试 | Regression & Testing
- 新增对 test-files/main.thrift 的回归测试，确保注解列对齐时尾随逗号紧跟注解文本、逗号前无多余空格；并更新尾随逗号相关测试覆盖（preserve/add/remove）。
  
  Added regression tests for test-files/main.thrift, ensuring trailing commas follow annotation text closely when annotation columns are aligned, with no extra spaces before commas; updated trailing comma test coverage (preserve/add/remove).

- 增补结构体、枚举及区间（range）格式化在多种组合配置下的测试用例。
  
  Added test cases for struct, enum, and range formatting under various configuration combinations.

### 验证 | Verification
- 通过 npm run build 与 npm run test:all 全量测试。
  
  Passed npm run build and npm run test:all comprehensive testing.

## 0.1.2 - 2025-09-13

### 修复 | Fixed
- 块注释缩进与星号列对齐，使注释与后续代码缩进一致且"*"列对齐。
  
  Fixed block comment indentation and asterisk column alignment, making comments consistent with subsequent code indentation and "*" columns aligned.

- 保持 const 语句与其后行注释的原始顺序，避免注释被移动到 const 上方。
  
  Maintained original order of const statements and their trailing line comments, preventing comments from being moved above const declarations.

### 验证 | Verification
- 通过 npm run build 与针对关键片段的手动验证。
  
  Passed npm run build and manual verification of key segments.

## 0.1.1 - 2025-09-13

### 修复 | Fixed
- 移除 src/formatter.ts 中遗留的差异标记（+/-），修复导致的大量 TypeScript 语法错误（如缺少分号、意外关键字等）。
  
  Removed residual diff markers (+/-) in src/formatter.ts, fixing numerous TypeScript syntax errors (such as missing semicolons, unexpected keywords, etc.).

- 修正 parseConstField 的位置与实现，确保常量解析在类内正确工作。
  
  Fixed parseConstField position and implementation, ensuring constant parsing works correctly within classes.

- 完善尾随逗号处理逻辑：结构体与枚举在 preserve / add / remove 三种模式下行为一致，测试覆盖通过。
  
  Improved trailing comma handling logic: structs and enums behave consistently in preserve/add/remove modes, with test coverage passing.

### 改进 | Improved
- 完善常量中集合（list/map/set/object）的格式化策略：
  
  Enhanced formatting strategy for collections (list/map/set/object) in constants:
  
  - collectionStyle=multiline：内联集合强制展开为多行。
    
    collectionStyle=multiline: Inline collections are forced to expand to multiple lines.
  
  - collectionStyle=auto：当整行（含注释）超过 maxLineLength 时自动展开为多行。
    
    collectionStyle=auto: Automatically expand to multiple lines when the entire line (including comments) exceeds maxLineLength.
  
  - 多行集合项对齐与行内注释对齐优化，提升可读性。
    
    Optimized multi-line collection item alignment and inline comment alignment for improved readability.

- 对齐宽度计算更稳健（使用已调整字段集进行对齐计算），避免边界情况下的错位。
  
  More robust alignment width calculation (using adjusted field sets for alignment calculation), avoiding misalignment in edge cases.

### 验证 | Verification
- 通过 npm run build 编译与 npm run test:all 全量测试（包含常量集合、多行对齐、尾随逗号与缩进宽度等测试）。
  
  Passed npm run build compilation and npm run test:all comprehensive testing (including constant collections, multi-line alignment, trailing commas, and indentation width tests).

### 备注 | Notes
- 配置项 collectionStyle（preserve/multiline/auto）与 maxLineLength 对"常量集合是否展开"影响更直观，建议结合团队规范使用。
  
  Configuration options collectionStyle (preserve/multiline/auto) and maxLineLength have more intuitive effects on "whether constant collections expand", recommended for use with team standards.

## 0.1.0 - 2025-09-13
- 初始版本：提供 Thrift 语法高亮、格式化与基础导航能力。
  
  Initial version: Provides Thrift syntax highlighting, formatting, and basic navigation capabilities.