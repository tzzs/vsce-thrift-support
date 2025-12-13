# Changelog | 更新日志

## [0.7.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.6.1...v0.7.0) (2025-12-13)


### Features

* **build:** optimise packing performance ([5c55b42](https://github.com/tzzs/vsce-thrift-support/commit/5c55b42b906da1d9864a57dd5ea070400fd31e0a))
* **style:** Optimise formatting issues ([7e3c43c](https://github.com/tzzs/vsce-thrift-support/commit/7e3c43c7ac686246bc472141c61953d131045baa))
* **style:** Optimise formatting issues ([7bb7566](https://github.com/tzzs/vsce-thrift-support/commit/7bb7566b93f2645205f75eb8292ca48282709802))


### Bug Fixes

* optimising the sorting order of enumerations after formatting ([67d8d84](https://github.com/tzzs/vsce-thrift-support/commit/67d8d8461e31d27ca225f4126c704eabe35b3cfb))
* reslove comment error ([0a104da](https://github.com/tzzs/vsce-thrift-support/commit/0a104daf38711c79144a5e6474190ab42e2e8598))

## [0.6.1](https://github.com/tzzs/vsce-thrift-support/compare/v0.6.0...v0.6.1) (2025-10-16)


### Bug Fixes

* **diagnostics:** fix enum value validation to support negative integ… ([484b170](https://github.com/tzzs/vsce-thrift-support/commit/484b170f5d3568f2d29b3db5f900d55320bbce3d))
* **diagnostics:** fix enum value validation to support negative integers and reject floats/hex ([9f36b2a](https://github.com/tzzs/vsce-thrift-support/commit/9f36b2ab94af60075fb0db486a301d18114eec6d))

## [0.6.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.5.0...v0.6.0) (2025-10-09)


### Features

* **docs,diagnostics:** add development guide and enhance error detection ([ffbe6d3](https://github.com/tzzs/vsce-thrift-support/commit/ffbe6d3707a1deb20b7af5d285a060a2522eedaa))


### Bug Fixes

* **diagnostics:** support namespaced service extends in regex ([bc42d89](https://github.com/tzzs/vsce-thrift-support/commit/bc42d8974f911ac9b8b813420f1c867983403702))

## [0.5.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.4.0...v0.5.0) (2025-09-22)

### 中文版本
#### 新功能
* 定义：限定名必须显式 include，并提供 Quick Fix 自动插入；对多义符号返回多条定义（[d56600b](https://github.com/tzzs/vsce-thrift-support/commit/d56600be43306127ca37c7140391b51b3436fce5)）
* 格式化/配置：将 alignStructAnnotations 重命名为 alignAnnotations，保留旧键作为兼容别名；贯通选项解析链路（[363cc33](https://github.com/tzzs/vsce-thrift-support/commit/363cc336cd28778b62197f07f30326bf14cdc44c)）
* 语言：与 Thrift IDL 0.23 对齐，uuid 视为内建基础类型（[4ced7be](https://github.com/tzzs/vsce-thrift-support/commit/4ced7be32521e30202dce7f8539612185b42c967)）
* 重构：新增 Code Actions、Diagnostics、Rename 提供器，并修正 VS Code API 类型绑定（[ccd89d8](https://github.com/tzzs/vsce-thrift-support/commit/ccd89d89ade398e3e9822223f863f3f54d8b7535)）

#### 错误修复
* 代码操作：仅在工作区存在目标文件时才提供 include Quick Fix，避免误导性的命名空间修复建议（[2df52d5](https://github.com/tzzs/vsce-thrift-support/commit/2df52d52fae18c6f56185d55ae144ea261d6999e)）
* 定义：改进命名空间点击导航与健壮性（[c9cabfc](https://github.com/tzzs/vsce-thrift-support/commit/c9cabfcd7b8ec8f7ab489021f28e608ecefc768f)）
* 定义：从行文本提取光标下单词；点击命名空间与类型之间的点号时不导航；点击命名空间时优先跳转到对应 include 行（[60f0685](https://github.com/tzzs/vsce-thrift-support/commit/60f068531f6e8db4931b74724977c16b4bbc04fc)）
* 诊断：接受 [] 作为 set&lt;T&gt; 默认字面量，避免误报类型不匹配；补充回归测试（[46800e6](https://github.com/tzzs/vsce-thrift-support/commit/46800e68fa5bec91e505e9642f2979dd52283738)）
* 诊断：允许 list/set/map 为空默认值，并新增 service 校验（[36cf59c](https://github.com/tzzs/vsce-thrift-support/commit/36cf59c2bcc204d67a04496f8e3c0a2a8ae1b395)）
* 诊断：提取默认值时忽略字段注解中的 '='（[1f6c5dd](https://github.com/tzzs/vsce-thrift-support/commit/1f6c5ddfccefbfaad97bd765b18081730863d10a)）
* 诊断：支持 uuid；剥离类型注解与跨行注释；改进 required/optional 与容器类型的字段解析（[8b8f5bf](https://github.com/tzzs/vsce-thrift-support/commit/8b8f5bfc826faae67184832f043dfc847405e4bc)）
* 诊断：未知类型的诊断范围从整行收敛至仅类型单词（[d26ce53](https://github.com/tzzs/vsce-thrift-support/commit/d26ce53d1126855d03de4c276540b16f810ec8d4)）
* 格式化器：更稳健的泛型签名规范化与引号/转义处理（[cdb2f40](https://github.com/tzzs/vsce-thrift-support/commit/cdb2f4010722686db3b06641770f549cb3fec34f)）
* 悬停：仅解析当前文档与显式 include 的文件，避免未 include 时跨文件 typedef 提示（[c37d2a2](https://github.com/tzzs/vsce-thrift-support/commit/c37d2a2ec7d1a71d325073e5a8873782f886c447)）

#### 性能优化
* 格式化器：热点路径微优化（[e6fe555](https://github.com/tzzs/vsce-thrift-support/commit/e6fe555376f7f4984aad500f578ee61286769f59)）

### English Version
#### Features
* definition: require include for qualified names and provide Quick Fix to insert include; return multiple definitions for ambiguous symbols ([d56600b](https://github.com/tzzs/vsce-thrift-support/commit/d56600be43306127ca37c7140391b51b3436fce5))
* formatter/config: rename alignStructAnnotations -&gt; alignAnnotations; keep legacy alias; wire through options and resolution logic ([363cc33](https://github.com/tzzs/vsce-thrift-support/commit/363cc336cd28778b62197f07f30326bf14cdc44c))
* language: align with Thrift IDL 0.23 — treat uuid as a built-in base type ([4ced7be](https://github.com/tzzs/vsce-thrift-support/commit/4ced7be32521e30202dce7f8539612185b42c967))
* thrift-refactor: add code actions provider, diagnostics, and rename provider implementations with VS Code API typings fixed ([ccd89d8](https://github.com/tzzs/vsce-thrift-support/commit/ccd89d89ade398e3e9822223f863f3f54d8b7535))

#### Bug Fixes
* code-actions: only offer include Quick Fix when the target file exists in workspace ([2df52d5](https://github.com/tzzs/vsce-thrift-support/commit/2df52d52fae18c6f56185d55ae144ea261d6999e))
* definition-provider: improve namespace navigation and robustness ([c9cabfc](https://github.com/tzzs/vsce-thrift-support/commit/c9cabfcd7b8ec8f7ab489021f28e608ecefc768f))
* definition-provider: extract clicked word from line text; ignore dot click between namespace and type; when clicking namespace, navigate to its include line if present ([60f0685](https://github.com/tzzs/vsce-thrift-support/commit/60f068531f6e8db4931b74724977c16b4bbc04fc))
* diagnostics: accept [] as set&lt;T&gt; default literal; add regression test ([46800e6](https://github.com/tzzs/vsce-thrift-support/commit/46800e68fa5bec91e505e9642f2979dd52283738))
* diagnostics: allow empty defaults for list/set/map and add service validation checks ([36cf59c](https://github.com/tzzs/vsce-thrift-support/commit/36cf59c2bcc204d67a04496f8e3c0a2a8ae1b395))
* diagnostics: ignore '=' in field annotations when extracting default values ([1f6c5dd](https://github.com/tzzs/vsce-thrift-support/commit/1f6c5ddfccefbfaad97bd765b18081730863d10a))
* diagnostics: support uuid; strip type annotations and multi-line comments; improve field parsing for required/optional and container types ([8b8f5bf](https://github.com/tzzs/vsce-thrift-support/commit/8b8f5bfc826faae67184832f043dfc847405e4bc))
* diagnostics: narrow unknown-type diagnostic range to the type token only ([d26ce53](https://github.com/tzzs/vsce-thrift-support/commit/d26ce53d1126855d03de4c276540b16f810ec8d4))
* formatter: robust generic signature normalization and quote/escape handling ([cdb2f40](https://github.com/tzzs/vsce-thrift-support/commit/cdb2f4010722686db3b06641770f549cb3fec34f))
* hover: restrict to current doc and explicitly included files to avoid cross-file typedef hints without include ([c37d2a2](https://github.com/tzzs/vsce-thrift-support/commit/c37d2a2ec7d1a71d325073e5a8873782f886c447))

#### Performance Improvements
* formatter: micro-optimize hot paths ([e6fe555](https://github.com/tzzs/vsce-thrift-support/commit/e6fe555376f7f4984aad500f578ee61286769f59))

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
