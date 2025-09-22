# Changelog | 更新日志

## [0.4.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.3.0...v0.4.0) (2025-09-20)

### 中文版本
#### 新功能
* **定义：** 支持带命名空间的类型定义（[e1b734e](https://github.com/tzzs/vsce-thrift-support/commit/e1b734eac5ff7771c252a440a858fa977600db91)）
* **配置/文档：** 将配置项 alignStructAnnotations 统一更名为 alignAnnotations；保留旧键作为兼容别名，并更新相关文档与测试。

#### 错误修复
* **格式化器：** 修正结构体字段中逗号与行内注释的间距（[2a8e431](https://github.com/tzzs/vsce-thrift-support/commit/2a8e4310f66d8754184b0214b755774a8de857b8)）
* **格式化器：** 统一结构体注解与行内注释的对齐（[c4eb59d](https://github.com/tzzs/vsce-thrift-support/commit/c4eb59d5768730906506d77b04e3cd32c1dbbed2)）
* **导航：** 优化 include 与 namespace 的点击目标；新增 namespace/include 测试；版本提升至 0.3.5（[3b71e5e](https://github.com/tzzs/vsce-thrift-support/commit/3b71e5e355b93c0bb8806c578c8acb51572ce7d3)）

### English Version
#### Features
* **definition:** add support for namespaced type definitions ([e1b734e](https://github.com/tzzs/vsce-thrift-support/commit/e1b734eac5ff7771c252a440a858fa977600db91))
* config/docs: Rename configuration key alignStructAnnotations to alignAnnotations; keep the old key as a legacy alias; updated documentation and tests accordingly.

#### Bug Fixes
* **formatter:** correct comma+comment spacing in struct fields ([2a8e431](https://github.com/tzzs/vsce-thrift-support/commit/2a8e4310f66d8754184b0214b755774a8de857b8))
* **formatter:** unify struct annotation and inline comment alignment ([c4eb59d](https://github.com/tzzs/vsce-thrift-support/commit/c4eb59d5768730906506d77b04e3cd32c1dbbed2))
* **navigation:** refine include + namespace click targets; add namespace/include tests; bump 0.3.5 ([3b71e5e](https://github.com/tzzs/vsce-thrift-support/commit/3b71e5e355b93c0bb8806c578c8acb51572ce7d3))

## [0.3.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.2.0...v0.3.0) (2025-09-19)

### 中文版本
#### 新功能
* **格式化器：** 为空行保留功能添加了全面的测试套件（[1fc51aa](https://github.com/tzzs/vsce-thrift-support/commit/1fc51aa318f16f24615ad9a1be31c78f65ae1914)）
* 添加 alignStructDefaults 配置项，分离结构体默认值对齐与普通等号对齐（[f147809](https://github.com/tzzs/vsce-thrift-support/commit/f14780960d212ef7171948a3236f56ede786100c)）

### English Version
#### Features
* **formatter:** add comprehensive test suite for blank line preservation ([1fc51aa](https://github.com/tzzs/vsce-thrift-support/commit/1fc51aa318f16f24615ad9a1be31c78f65ae1914))
* Add alignStructDefaults configuration option to separate struct default value alignment from regular equals alignment ([f147809](https://github.com/tzzs/vsce-thrift-support/commit/f14780960d212ef7171948a3236f56ede786100c))

## [0.2.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.1.4...v0.2.0) (2025-09-16)

### 中文版本
#### 新功能
* **测试：** 添加结构体注解对齐测试用例（[5496214](https://github.com/tzzs/vsce-thrift-support/commit/5496214f9303b06d92dce91a740ec4e08b705e16)）
* **Thrift：** 添加注解对齐格式化和测试（[61d13e8](https://github.com/tzzs/vsce-thrift-support/commit/61d13e8b36c2cf679a96a5385221d8cd687d7c71)）

#### 错误修复
* **格式化器：** 确保结构体字段中逗号的紧密放置（[62172d5](https://github.com/tzzs/vsce-thrift-support/commit/62172d5d0a57c8c0bcff3f91eccbe7ec6de1efeb)）

### English Version
#### Features
* **tests:** add struct annotation alignment test cases ([5496214](https://github.com/tzzs/vsce-thrift-support/commit/5496214f9303b06d92dce91a740ec4e08b705e16))
* **thrift:** add annotation alignment formatting and tests ([61d13e8](https://github.com/tzzs/vsce-thrift-support/commit/61d13e8b36c2cf679a96a5385221d8cd687d7c71))

#### Bug Fixes
* **formatter:** ensure tight comma placement in struct fields ([62172d5](https://github.com/tzzs/vsce-thrift-support/commit/62172d5d0a57c8c0bcff3f91eccbe7ec6de1efeb))

## 0.1.5 - 2025-09-16

### 中文版本
#### 新增
* 新增配置项 thrift.format.alignStructAnnotations，用于控制结构体字段注解的对齐。

#### 改进
* 实现结构体字段注解对齐的格式化逻辑，并与类型/字段名/注释等对齐选项组合时保持稳定。
* 支持 range 格式化上下文（range format context）。

#### 回归与测试
* 新增对 test-files/main.thrift 的回归测试，确保注解列对齐时尾随逗号紧跟注解文本、逗号前无多余空格；并更新尾随逗号相关测试覆盖（preserve/add/remove）。
* 增补结构体、枚举及区间（range）格式化在多种组合配置下的测试用例。

### English Version
#### Added
* Added configuration option thrift.format.alignStructAnnotations to control struct field annotation alignment.

#### Improvements
* Implemented struct field annotation alignment formatting logic, maintaining stability when combined with type/field name/comment alignment options.
* Support for range format context.

#### Regression & Testing
* Added regression tests for test-files/main.thrift, ensuring trailing commas follow annotation text closely when annotation columns are aligned, with no extra spaces before commas; updated trailing comma test coverage (preserve/add/remove).
* Added test cases for struct, enum, and range formatting under various configuration combinations.

## 0.1.2 - 2025-09-13

### 中文版本
#### 错误修复
* 块注释缩进与星号列对齐，使注释与后续代码缩进一致且"*"列对齐。
* 保持 const 语句与其后行注释的原始顺序，避免注释被移动到 const 上方。

#### 改进
* 完善常量中集合（list/map/set/object）的格式化策略：
  * collectionStyle=multiline：内联集合强制展开为多行。
  * collectionStyle=auto：当整行（含注释）超过 maxLineLength 时自动展开为多行。
  * 多行集合项对齐与行内注释对齐优化，提升可读性。
* 对齐宽度计算更稳健（使用已调整字段集进行对齐计算），避免边界情况下的错位。

#### 备注
* 配置项 collectionStyle（preserve/multiline/auto）与 maxLineLength 对"常量集合是否展开"影响更直观，建议结合团队规范使用。

### English Version
#### Bug Fixes
* Fixed block comment indentation and asterisk column alignment, making comments consistent with subsequent code indentation and "*" columns aligned.
* Maintained original order of const statements and their trailing line comments, preventing comments from being moved above const declarations.

#### Improvements
* Enhanced formatting strategy for collections (list/map/set/object) in constants:
  * collectionStyle=multiline: Inline collections are forced to expand to multiple lines.
  * collectionStyle=auto: Automatically expand to multiple lines when the entire line (including comments) exceeds maxLineLength.
  * Optimized multi-line collection item alignment and inline comment alignment for improved readability.
* More robust alignment width calculation (using adjusted field sets for alignment calculation), avoiding misalignment in edge cases.

#### Notes
* Configuration options collectionStyle (preserve/multiline/auto) and maxLineLength have more intuitive effects on "whether constant collections expand", recommended for use with team standards.

## 0.1.1 - 2025-09-13

### 中文版本
#### 错误修复
* 移除 src/formatter.ts 中遗留的差异标记（+/-），修复导致的大量 TypeScript 语法错误（如缺少分号、意外关键字等）。
* 修正 parseConstField 的位置与实现，确保常量解析在类内正确工作。
* 完善尾随逗号处理逻辑：结构体与枚举在 preserve / add / remove 三种模式下行为一致，测试覆盖通过。

#### 验证
* 通过 npm run build 与针对关键片段的手动验证。

### English Version
#### Bug Fixes
* Removed residual diff markers (+/-) in src/formatter.ts, fixing numerous TypeScript syntax errors (such as missing semicolons, unexpected keywords, etc.).
* Fixed parseConstField position and implementation, ensuring constant parsing works correctly within classes.
* Improved trailing comma handling logic: structs and enums behave consistently in preserve/add/remove modes, with test coverage passing.

#### Verification
* Passed npm run build and manual verification of key segments.

## 0.1.0 - 2025-09-13

### 中文版本
#### 新功能
* 初始版本：提供 Thrift 语法高亮、格式化与基础导航能力。

### English Version
#### Features
* Initial version: Provides Thrift syntax highlighting, formatting, and basic navigation capabilities.
