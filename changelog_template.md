# Changelog Template | 更新日志模板

<!--
使用说明 Usage
1. 复制本模板，替换占位符（版本号、日期、链接、条目内容）。
2. 保持与既有版本一致的双语结构：先中文版本，再 English Version。
3. 各小节内使用“单行要点”式条目；若该小节无内容，直接省略该小节。
4. 为每条变更附上提交短哈希链接：[abcdef1](https://github.com/OWNER/REPO/commit/abcdef1)。
5. 建议条目前使用“作用域/模块”前缀（中文用全角冒号：，英文用冒号:）。
   常用作用域举例：定义/导航/格式化器/诊断/悬停/配置/语言/重构/代码操作
   English scopes: definition-provider/navigation/formatter/diagnostics/hover/config/language/refactor/code-actions
6. 版本标题的 compare 链接形如：https://github.com/OWNER/REPO/compare/vPREV...vX.Y.Z
7. 遵循“单行、简洁、能定位”的原则；多点说明时可用分号隔开，避免换行列表。
-->

## [X.Y.Z](https://github.com/OWNER/REPO/compare/vPREVIOUS...vX.Y.Z) (YYYY-MM-DD)

### 中文版本

#### 新功能

* 作用域：简要描述；如有多点用分号隔开（[abcdef1](https://github.com/OWNER/REPO/commit/abcdef1)）
* 作用域：简要描述（[1234567](https://github.com/OWNER/REPO/commit/1234567)）

#### 错误修复

* 作用域：简要描述（[89abcde](https://github.com/OWNER/REPO/commit/89abcde)）

#### 性能优化

* 作用域：简要描述（[7654321](https://github.com/OWNER/REPO/commit/7654321)）

<!-- 可选：仅在存在破坏性变更时添加 -->

#### 破坏性变更

* 作用域：变更点与迁移说明（[fedcba9](https://github.com/OWNER/REPO/commit/fedcba9)）

<!-- 可选：需要时启用文档/构建/其他分类；若无内容请删除整个分节
#### 文档
* README/指南：简要描述（[abc1111](https://github.com/OWNER/REPO/commit/abc1111)）

#### 构建/发布
* CI/打包：简要描述（[abc2222](https://github.com/OWNER/REPO/commit/abc2222)）
-->

### English Version

#### Features

* scope: concise description; separate multiple points with
  semicolons ([abcdef1](https://github.com/OWNER/REPO/commit/abcdef1))
* scope: concise description ([1234567](https://github.com/OWNER/REPO/commit/1234567))

#### Bug Fixes

* scope: concise description ([89abcde](https://github.com/OWNER/REPO/commit/89abcde))

#### Performance Improvements

* scope: concise description ([7654321](https://github.com/OWNER/REPO/commit/7654321))

<!-- Optional: only when you have breaking changes -->

#### Breaking Changes

* scope: breaking change and migration notes ([fedcba9](https://github.com/OWNER/REPO/commit/fedcba9))

<!-- Optional: enable when needed; remove if empty
#### Docs
* README/guide: concise description ([abc1111](https://github.com/OWNER/REPO/commit/abc1111))

#### Build/Release
* CI/packaging: concise description ([abc2222](https://github.com/OWNER/REPO/commit/abc2222))
-->

<!--
示例 Example (请在使用时删除)：
## [0.5.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.4.0...v0.5.0) (2025-09-22)

### 中文版本
#### 新功能
* 定义：限定名必须显式 include，并提供 Quick Fix；对多义符号返回多条定义（[d56600b](https://github.com/tzzs/vsce-thrift-support/commit/d56600be43306127ca37c7140391b51b3436fce5)）

#### 错误修复
* 定义：从行文本提取光标下单词；点号点击不导航；命名空间点击跳转对应 include 行（[60f0685](https://github.com/tzzs/vsce-thrift-support/commit/60f068531f6e8db4931b74724977c16b4bbc04fc)）

### English Version
#### Features
* definition: require include for qualified names; Quick Fix to insert include; multiple definitions for ambiguous symbols ([d56600b](https://github.com/tzzs/vsce-thrift-support/commit/d56600be43306127ca37c7140391b51b3436fce5))

#### Bug Fixes
* definition-provider: extract clicked word from line text; ignore dot click; namespace click goes to include line ([60f0685](https://github.com/tzzs/vsce-thrift-support/commit/60f068531f6e8db4931b74724977c16b4bbc04fc))
-->