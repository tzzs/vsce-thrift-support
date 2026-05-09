# Changelog | 更新日志

## [2.2.0](https://github.com/tzzs/vsce-thrift-support/compare/v2.1.1...v2.2.0) (2026-05-09)


### Features

* add parser and AST support for interaction, stream, sink, performs ([82a3ab5](https://github.com/tzzs/vsce-thrift-support/commit/82a3ab5668f15c2c255a62cfd52cb19c8be5e7f6))
* add provider support for interaction across all language features ([e65f792](https://github.com/tzzs/vsce-thrift-support/commit/e65f7928271c0cb4cbb7b6677d7b958f52a85ce6))


### Bug Fixes

* align CI build scripts, npm ci, and tsconfig for review findings ([b53cddf](https://github.com/tzzs/vsce-thrift-support/commit/b53cddf2685bc8bdb08352d9b3063df93a5fa909))
* align TextMate grammar scopes to official conventions and fix tokenization edge cases ([5da6f52](https://github.com/tzzs/vsce-thrift-support/commit/5da6f52afef1dca3a1b229ddf4b7e4dee6e1c173))
* align TextMate scopes to official naming conventions ([b44f833](https://github.com/tzzs/vsce-thrift-support/commit/b44f8330d422b9d8cc6746d541909d7375bf1922))
* **ci:** add @eslint/js as explicit devDependency for pnpm strict isolation ([a4429fc](https://github.com/tzzs/vsce-thrift-support/commit/a4429fce92fe5411ecfbe168439a626a24f327b3))
* code review fixes — eliminate formatter state, security deps, and code cleanup ([c87d504](https://github.com/tzzs/vsce-thrift-support/commit/c87d504d780177b58f725adf2c8eeb24c344b7f6))
* correct // comment indent in interaction blocks and recognize reference&lt;interaction&gt; type ([ce52a31](https://github.com/tzzs/vsce-thrift-support/commit/ce52a3191b09934e4c72ca0cc6739bce941510a5))
* **deps:** remove deprecated vscode package and add pnpm overrides to fix all known vulnerabilities ([b0bc590](https://github.com/tzzs/vsce-thrift-support/commit/b0bc590af2f03da34cbc5de7e992024a0cd05e00))
* **formatter:** eliminate module-level state and fix annotation depth tracking ([f915a6e](https://github.com/tzzs/vsce-thrift-support/commit/f915a6e9985789a4e6b568d02ab18790ed38aa2f))
* **formatter:** ignore braces in string literals and line comments when tracking annotation depth ([e8934e0](https://github.com/tzzs/vsce-thrift-support/commit/e8934e09a34a22b7c195deb8249507a9fe800fbe))
* **formatter:** preserve interaction context for range formatting ([7ad7dee](https://github.com/tzzs/vsce-thrift-support/commit/7ad7deea1c64c448d578d1ec2dd974da583fe38f))
* **formatter:** remove spurious extra space before comment on no-comma fields ([187167f](https://github.com/tzzs/vsce-thrift-support/commit/187167fc5486741e1d43b309d2b8f3d7a55fc432))
* **formatter:** remove spurious extra space before comment on no-comma fields ([7c2a6b8](https://github.com/tzzs/vsce-thrift-support/commit/7c2a6b85fb0dd614e8efad41c33b88f32cf4005f))
* **formatter:** restore annotation empty-string semantics broken by ESLint auto-fix ([b9e94e4](https://github.com/tzzs/vsce-thrift-support/commit/b9e94e4bdc18dae2999b54799b986c557297ebf1))
* **grammar:** add word boundary to required/optional modifier match in method parameters ([1b2a9ea](https://github.com/tzzs/vsce-thrift-support/commit/1b2a9ea0280f137365c1340eb84a7a56799763d0))
* **grammar:** fix service method parameter scopes and enum member name tokenization ([76e055f](https://github.com/tzzs/vsce-thrift-support/commit/76e055fb2f3b2fa3b88d4a007fbcf0b8057cbe4d))
* **grammar:** fix service method parameter scopes and enum member name tokenization ([0ba9c6e](https://github.com/tzzs/vsce-thrift-support/commit/0ba9c6ec2382b8b4fed380faa9b5f52eb48200ce))
* **lint:** change hasCommaForWidth to const ([ab575ea](https://github.com/tzzs/vsce-thrift-support/commit/ab575ea903faf0c7d8fdfd4d354e793e2aafa32e))
* **lint:** remove unnecessary type assertions in setup.ts and workspace-symbol-provider.ts ([1f0ad7f](https://github.com/tzzs/vsce-thrift-support/commit/1f0ad7f75705b882d3a685d89fac005073e5af71))
* **lint:** resolve eqeqeq and strict-boolean-expressions ESLint errors ([3bca29f](https://github.com/tzzs/vsce-thrift-support/commit/3bca29f68741e26bd906b7e5c06755f24e0d1862))
* **references:** map Performs node to interaction symbol type ([4b1bccf](https://github.com/tzzs/vsce-thrift-support/commit/4b1bccfce7e1e83ad242587a4a5dbb8a5657b8ab))
* resolve 13 test failures across three modules ([f8707ed](https://github.com/tzzs/vsce-thrift-support/commit/f8707ed44da253a350c794fc0af79c83e9433d67))
* resolve all-purple highlighting in One Dark Pro theme ([6def0c6](https://github.com/tzzs/vsce-thrift-support/commit/6def0c6f49cf6f27b0004a1e9413e71a6b55154f))
* resolve all-purple highlighting in One Dark Pro theme ([f1805de](https://github.com/tzzs/vsce-thrift-support/commit/f1805dec92281b2145e7aba6fd90bd15fc7cb4ac))
* **sampler:** use nullish coalescing for zero-value config parameters ([7b7bb4a](https://github.com/tzzs/vsce-thrift-support/commit/7b7bb4a1728284e9a27995321180c577781b07ec))
* support negative integer values in enum field highlighting ([5a3eef2](https://github.com/tzzs/vsce-thrift-support/commit/5a3eef211bf4ecca0adeed8dad13a806e2fe514e))
* support stream/sink/interaction/reference types in diagnostics and formatter ([0baead7](https://github.com/tzzs/vsce-thrift-support/commit/0baead7ff228a5738a47a18792ee929014038704))
* **syntax:** restore correct type scope for deeply nested container types ([7840f34](https://github.com/tzzs/vsce-thrift-support/commit/7840f347e05d66d679ac10aa31bb71501d245a61))
* **syntax:** restore correct type scope for deeply nested container types ([8c3faee](https://github.com/tzzs/vsce-thrift-support/commit/8c3faee15134ebacb4c2f97b3518e7097fa3bfb1))
* **test:** add .thrift suffix to comment scope assertion in namespace test ([a19c43c](https://github.com/tzzs/vsce-thrift-support/commit/a19c43cc3feb825f83e538e24f1ad302078c2a5e))
* use support.type.primitive scope for better One Dark Pro compatibility ([7774b34](https://github.com/tzzs/vsce-thrift-support/commit/7774b34554aa3a9c51b1810241c688b498ef268f))


### Performance Improvements

* **parser:** pre-allocate body array and extract createRange helper ([5407f4e](https://github.com/tzzs/vsce-thrift-support/commit/5407f4e8f3c861cd4e234247ba5cac7fbeae9f31))
* reduce memory monitoring poll interval from 30s to 120s ([f57abf6](https://github.com/tzzs/vsce-thrift-support/commit/f57abf64bb068e7ff14548d37a3b32a93207ea60))

## [2.1.1](https://github.com/tzzs/vsce-thrift-support/compare/v2.1.0...v2.1.1) (2026-05-07)


### Bug Fixes

* **formatter:** correct comma/semicolon placement, service brace indent, and enum empty equals ([b7162c1](https://github.com/tzzs/vsce-thrift-support/commit/b7162c16e1b14917621189444155261a959f7e1d))
* **formatter:** Fix struct field parsing, comma handling, const alignment, and collection expansion ([93d27d3](https://github.com/tzzs/vsce-thrift-support/commit/93d27d3ed9dcc9417f5ec02ce9908294940afb3b))
* **syntax:** Simplify container type highlighting and enhance method definition patterns ([d4396f1](https://github.com/tzzs/vsce-thrift-support/commit/d4396f19157ef131b52b89414cc5df03a4772f49))

## [2.1.0](https://github.com/tzzs/vsce-thrift-support/compare/v2.0.1...v2.1.0) (2026-02-11)

### 🎉 Happy Chinese New Year 2026!

### Features

* add incremental parsing workflow ([807ebd0](https://github.com/tzzs/vsce-thrift-support/commit/807ebd0e2d5fbbe7fc5cc618b9f31dae27f65259))
* enhance performance monitoring ([b694ebf](https://github.com/tzzs/vsce-thrift-support/commit/b694ebfb749bbd50ba14cb90229b1ebc1d642d18))
* implement comprehensive memory management optimizations for Thrift extension ([919cc76](https://github.com/tzzs/vsce-thrift-support/commit/919cc7632f5fb78f9676b87b77de9dd1d17d89f1))
* implement comprehensive memory management optimizations for Thrift extension ([962b873](https://github.com/tzzs/vsce-thrift-support/commit/962b873f7ed56c30b06ae7d98231a38d4b1b0f06))
* implement comprehensive performance and memory optimizations for Thrift extension ([23857cd](https://github.com/tzzs/vsce-thrift-support/commit/23857cda48fb4a2f510eab986d3fb345a55d80ec))
* implement comprehensive performance optimizations and caching improvements ([5f36b3c](https://github.com/tzzs/vsce-thrift-support/commit/5f36b3c765fd2593dcea943c9ee8a276d5772731))
* implement comprehensive performance optimizations for Thrift extension ([ae5d72c](https://github.com/tzzs/vsce-thrift-support/commit/ae5d72ceace24438fb642cd4eeb7a88757c14af3))
* upgrade to ESLint v9 with flat config ([c3c28ac](https://github.com/tzzs/vsce-thrift-support/commit/c3c28ac9efcb0d32825ee69ffdd2fe4af6d80218))


### Bug Fixes

* address code review findings and improve code quality ([3116a86](https://github.com/tzzs/vsce-thrift-support/commit/3116a86eb03d87423c008f8e4c1722353047586b))
* address code review findings and improve performance optimizations ([3399d71](https://github.com/tzzs/vsce-thrift-support/commit/3399d719250f9120c13d261c902bc6eed5bde071))
* address code review findings and improve test coverage ([52012c1](https://github.com/tzzs/vsce-thrift-support/commit/52012c12ab6e27f68b477c02858e635bfa7a667e))
* **formatter:** append trailing punctuation at end of line after comments ([c0083fd](https://github.com/tzzs/vsce-thrift-support/commit/c0083fd83a1d16fe5471ca8bc30c4f0937fb75ac))
* improve type safety and robustness in performance optimization code ([5296537](https://github.com/tzzs/vsce-thrift-support/commit/52965379a2f301b839137bf5023e1129b432766b))
* resolve VS Code API type errors in providers ([855be41](https://github.com/tzzs/vsce-thrift-support/commit/855be41dc8b57d905404a0222177ab651331875e))

## [2.0.1](https://github.com/tzzs/vsce-thrift-support/compare/v2.0.0...v2.0.1) (2026-01-12)


### Bug Fixes

* handle inline empty struct/service bodies ([b34f352](https://github.com/tzzs/vsce-thrift-support/commit/b34f35219ac9e09e1c08e89af497ac71b03eb6eb))
* handle inline empty struct/service bodies ([6f1e1e0](https://github.com/tzzs/vsce-thrift-support/commit/6f1e1e0cad515b0a1f66dd4d26a3898c722357b0))
* ignore string braces when counting blocks ([5d80cfa](https://github.com/tzzs/vsce-thrift-support/commit/5d80cfacfd1514ab11c387f79f183b1c06d2288b))

## [2.0.0](https://github.com/tzzs/vsce-thrift-support/compare/v1.0.0...v2.0.0) (2026-01-12)

### ⚠ BREAKING CHANGES

* refactor!: support Thrift AST as the core parsing model and reorganize parser/formatter/diagnostics internals
* feat!: new major release line (2.x) with significant internal API and cache flow changes

### Features

* incremental diagnostics and formatting with dirty-range tracking
* expanded AST ranges (name/type/default/value) and richer symbol extraction
* performance monitoring and cache manager integration across providers

### Bug Fixes

* formatter alignment, annotation handling, and inline const collection parsing
* diagnostics include/type resolution and unknown-type range accuracy
* workspace symbol caching now preserves non-file URI schemes
* tokenizer ignores block comments to prevent false top-level declarations

### Performance Improvements

* incremental analysis scheduling and concurrency controls
* cache eviction and reuse optimizations for diagnostics and workspace scans

### Testing

* migration to Mocha with unified VSCode mock injection
* new regression coverage for formatting idempotency, incremental formatting, and parser edge cases

## [1.0.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.7.1...v1.0.0) (2025-12-15)

### ⚠ BREAKING CHANGES

* Removed all scanning-related configuration options including
    - thrift.enableWorkspaceSymbolScanning
    - thrift.enableReferenceScanning
    - thrift.scanningMode
    - thrift.maxFilesToScan
    - thrift.scanInterval
    - thrift.scanOnDocumentActivate
    - config-schema.json file

### Features

* add performance optimizations and comprehensive unit
  tests ([0a12912](https://github.com/tzzs/vsce-thrift-support/commit/0a12912ab295f5619b41bbd4eb0afd2788a13859))

### Bug Fixes

* **formatter,definition:** fix service indentation, comment alignment and external
  navigation ([cc97005](https://github.com/tzzs/vsce-thrift-support/commit/cc97005a77dc028c26c0ab00e4553e98bb6c3f29))

### Code Refactoring

* remove scanning configuration options to simplify user
  experience ([ba5b9a6](https://github.com/tzzs/vsce-thrift-support/commit/ba5b9a690cd1c4265d954588f48593c7bfbdc98e))

## [0.7.1](https://github.com/tzzs/vsce-thrift-support/compare/v0.7.0...v0.7.1) (2025-12-14)

### Bug Fixes

* Fix service documentation comment indentation and alignment
  issues ([061676a](https://github.com/tzzs/vsce-thrift-support/commit/061676a88a0fb9f248c9b720227fddbbfcdbbd1d))
* opti format ([10058d3](https://github.com/tzzs/vsce-thrift-support/commit/10058d323961b994961e9874d203864390275c5f))

## [0.7.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.6.1...v0.7.0) (2025-12-13)

### Features

* **build:** optimise packing
  performance ([5c55b42](https://github.com/tzzs/vsce-thrift-support/commit/5c55b42b906da1d9864a57dd5ea070400fd31e0a))
* **style:** Optimise formatting
  issues ([7e3c43c](https://github.com/tzzs/vsce-thrift-support/commit/7e3c43c7ac686246bc472141c61953d131045baa))
* **style:** Optimise formatting
  issues ([7bb7566](https://github.com/tzzs/vsce-thrift-support/commit/7bb7566b93f2645205f75eb8292ca48282709802))

### Bug Fixes

* optimising the sorting order of enumerations after
  formatting ([67d8d84](https://github.com/tzzs/vsce-thrift-support/commit/67d8d8461e31d27ca225f4126c704eabe35b3cfb))
* reslove comment
  error ([0a104da](https://github.com/tzzs/vsce-thrift-support/commit/0a104daf38711c79144a5e6474190ab42e2e8598))

## [0.6.1](https://github.com/tzzs/vsce-thrift-support/compare/v0.6.0...v0.6.1) (2025-10-16)

### Bug Fixes

* **diagnostics:** fix enum value validation to support negative
  integ… ([484b170](https://github.com/tzzs/vsce-thrift-support/commit/484b170f5d3568f2d29b3db5f900d55320bbce3d))
* **diagnostics:** fix enum value validation to support negative integers and reject
  floats/hex ([9f36b2a](https://github.com/tzzs/vsce-thrift-support/commit/9f36b2ab94af60075fb0db486a301d18114eec6d))

## [0.6.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.5.0...v0.6.0) (2025-10-09)

### Features

* **docs,diagnostics:** add development guide and enhance error
  detection ([ffbe6d3](https://github.com/tzzs/vsce-thrift-support/commit/ffbe6d3707a1deb20b7af5d285a060a2522eedaa))

### Bug Fixes

* **diagnostics:** support namespaced service extends in
  regex ([bc42d89](https://github.com/tzzs/vsce-thrift-support/commit/bc42d8974f911ac9b8b813420f1c867983403702))

## [0.5.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.4.0...v0.5.0) (2025-09-22)

### 中文版本

#### 新功能

* 定义：限定名必须显式 include，并提供 Quick Fix
  自动插入；对多义符号返回多条定义（[d56600b](https://github.com/tzzs/vsce-thrift-support/commit/d56600be43306127ca37c7140391b51b3436fce5)）
* 格式化/配置：将 alignStructAnnotations 重命名为
  alignAnnotations，保留旧键作为兼容别名；贯通选项解析链路（[363cc33](https://github.com/tzzs/vsce-thrift-support/commit/363cc336cd28778b62197f07f30326bf14cdc44c)）
* 语言：与 Thrift IDL 0.23 对齐，uuid
  视为内建基础类型（[4ced7be](https://github.com/tzzs/vsce-thrift-support/commit/4ced7be32521e30202dce7f8539612185b42c967)）
* 重构：新增 Code Actions、Diagnostics、Rename 提供器，并修正 VS Code API
  类型绑定（[ccd89d8](https://github.com/tzzs/vsce-thrift-support/commit/ccd89d89ade398e3e9822223f863f3f54d8b7535)）

#### 错误修复

* 代码操作：仅在工作区存在目标文件时才提供 include Quick
  Fix，避免误导性的命名空间修复建议（[2df52d5](https://github.com/tzzs/vsce-thrift-support/commit/2df52d52fae18c6f56185d55ae144ea261d6999e)）
*

定义：改进命名空间点击导航与健壮性（[c9cabfc](https://github.com/tzzs/vsce-thrift-support/commit/c9cabfcd7b8ec8f7ab489021f28e608ecefc768f)）

* 定义：从行文本提取光标下单词；点击命名空间与类型之间的点号时不导航；点击命名空间时优先跳转到对应 include
  行（[60f0685](https://github.com/tzzs/vsce-thrift-support/commit/60f068531f6e8db4931b74724977c16b4bbc04fc)）
* 诊断：接受 [] 作为 set&lt;T&gt;
  默认字面量，避免误报类型不匹配；补充回归测试（[46800e6](https://github.com/tzzs/vsce-thrift-support/commit/46800e68fa5bec91e505e9642f2979dd52283738)）
* 诊断：允许 list/set/map 为空默认值，并新增 service
  校验（[36cf59c](https://github.com/tzzs/vsce-thrift-support/commit/36cf59c2bcc204d67a04496f8e3c0a2a8ae1b395)）
*

诊断：提取默认值时忽略字段注解中的 '='（[1f6c5dd](https://github.com/tzzs/vsce-thrift-support/commit/1f6c5ddfccefbfaad97bd765b18081730863d10a)）

* 诊断：支持 uuid；剥离类型注解与跨行注释；改进 required/optional
  与容器类型的字段解析（[8b8f5bf](https://github.com/tzzs/vsce-thrift-support/commit/8b8f5bfc826faae67184832f043dfc847405e4bc)）
*

诊断：未知类型的诊断范围从整行收敛至仅类型单词（[d26ce53](https://github.com/tzzs/vsce-thrift-support/commit/d26ce53d1126855d03de4c276540b16f810ec8d4)）

*

格式化器：更稳健的泛型签名规范化与引号/转义处理（[cdb2f40](https://github.com/tzzs/vsce-thrift-support/commit/cdb2f4010722686db3b06641770f549cb3fec34f)）

* 悬停：仅解析当前文档与显式 include 的文件，避免未 include 时跨文件 typedef
  提示（[c37d2a2](https://github.com/tzzs/vsce-thrift-support/commit/c37d2a2ec7d1a71d325073e5a8873782f886c447)）

#### 性能优化

*

格式化器：热点路径微优化（[e6fe555](https://github.com/tzzs/vsce-thrift-support/commit/e6fe555376f7f4984aad500f578ee61286769f59)）

### English Version

#### Features

* definition: require include for qualified names and provide Quick Fix to insert include; return multiple definitions
  for ambiguous
  symbols ([d56600b](https://github.com/tzzs/vsce-thrift-support/commit/d56600be43306127ca37c7140391b51b3436fce5))
* formatter/config: rename alignStructAnnotations -&gt; alignAnnotations; keep legacy alias; wire through options and
  resolution
  logic ([363cc33](https://github.com/tzzs/vsce-thrift-support/commit/363cc336cd28778b62197f07f30326bf14cdc44c))
* language: align with Thrift IDL 0.23 — treat uuid as a built-in base
  type ([4ced7be](https://github.com/tzzs/vsce-thrift-support/commit/4ced7be32521e30202dce7f8539612185b42c967))
* thrift-refactor: add code actions provider, diagnostics, and rename provider implementations with VS Code API typings
  fixed ([ccd89d8](https://github.com/tzzs/vsce-thrift-support/commit/ccd89d89ade398e3e9822223f863f3f54d8b7535))

#### Bug Fixes

* code-actions: only offer include Quick Fix when the target file exists in
  workspace ([2df52d5](https://github.com/tzzs/vsce-thrift-support/commit/2df52d52fae18c6f56185d55ae144ea261d6999e))
* definition-provider: improve namespace navigation and
  robustness ([c9cabfc](https://github.com/tzzs/vsce-thrift-support/commit/c9cabfcd7b8ec8f7ab489021f28e608ecefc768f))
* definition-provider: extract clicked word from line text; ignore dot click between namespace and type; when clicking
  namespace, navigate to its include line if
  present ([60f0685](https://github.com/tzzs/vsce-thrift-support/commit/60f068531f6e8db4931b74724977c16b4bbc04fc))
* diagnostics: accept [] as set&lt;T&gt; default literal; add regression
  test ([46800e6](https://github.com/tzzs/vsce-thrift-support/commit/46800e68fa5bec91e505e9642f2979dd52283738))
* diagnostics: allow empty defaults for list/set/map and add service validation
  checks ([36cf59c](https://github.com/tzzs/vsce-thrift-support/commit/36cf59c2bcc204d67a04496f8e3c0a2a8ae1b395))
* diagnostics: ignore '=' in field annotations when extracting default
  values ([1f6c5dd](https://github.com/tzzs/vsce-thrift-support/commit/1f6c5ddfccefbfaad97bd765b18081730863d10a))
* diagnostics: support uuid; strip type annotations and multi-line comments; improve field parsing for required/optional
  and container
  types ([8b8f5bf](https://github.com/tzzs/vsce-thrift-support/commit/8b8f5bfc826faae67184832f043dfc847405e4bc))
* diagnostics: narrow unknown-type diagnostic range to the type token
  only ([d26ce53](https://github.com/tzzs/vsce-thrift-support/commit/d26ce53d1126855d03de4c276540b16f810ec8d4))
* formatter: robust generic signature normalization and quote/escape
  handling ([cdb2f40](https://github.com/tzzs/vsce-thrift-support/commit/cdb2f4010722686db3b06641770f549cb3fec34f))
* hover: restrict to current doc and explicitly included files to avoid cross-file typedef hints without
  include ([c37d2a2](https://github.com/tzzs/vsce-thrift-support/commit/c37d2a2ec7d1a71d325073e5a8873782f886c447))

#### Performance Improvements

* formatter: micro-optimize hot
  paths ([e6fe555](https://github.com/tzzs/vsce-thrift-support/commit/e6fe555376f7f4984aad500f578ee61286769f59))

## [0.4.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.3.0...v0.4.0) (2025-09-20)

### 中文版本

#### 新功能

* **定义：**
  支持带命名空间的类型定义（[e1b734e](https://github.com/tzzs/vsce-thrift-support/commit/e1b734eac5ff7771c252a440a858fa977600db91)）
* **配置/文档：** 将配置项 alignStructAnnotations 统一更名为 alignAnnotations；保留旧键作为兼容别名，并更新相关文档与测试。

#### 错误修复

* **格式化器：**
  修正结构体字段中逗号与行内注释的间距（[2a8e431](https://github.com/tzzs/vsce-thrift-support/commit/2a8e4310f66d8754184b0214b755774a8de857b8)）
* **格式化器：**
  统一结构体注解与行内注释的对齐（[c4eb59d](https://github.com/tzzs/vsce-thrift-support/commit/c4eb59d5768730906506d77b04e3cd32c1dbbed2)）
* **导航：** 优化 include 与 namespace 的点击目标；新增 namespace/include 测试；版本提升至
  0.3.5（[3b71e5e](https://github.com/tzzs/vsce-thrift-support/commit/3b71e5e355b93c0bb8806c578c8acb51572ce7d3)）

### English Version

#### Features

* **definition:** add support for namespaced type
  definitions ([e1b734e](https://github.com/tzzs/vsce-thrift-support/commit/e1b734eac5ff7771c252a440a858fa977600db91))
* config/docs: Rename configuration key alignStructAnnotations to alignAnnotations; keep the old key as a legacy alias;
  updated documentation and tests accordingly.

#### Bug Fixes

* **formatter:** correct comma+comment spacing in struct
  fields ([2a8e431](https://github.com/tzzs/vsce-thrift-support/commit/2a8e4310f66d8754184b0214b755774a8de857b8))
* **formatter:** unify struct annotation and inline comment
  alignment ([c4eb59d](https://github.com/tzzs/vsce-thrift-support/commit/c4eb59d5768730906506d77b04e3cd32c1dbbed2))
* **navigation:** refine include + namespace click targets; add namespace/include tests; bump
  0.3.5 ([3b71e5e](https://github.com/tzzs/vsce-thrift-support/commit/3b71e5e355b93c0bb8806c578c8acb51572ce7d3))

## [0.3.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.2.0...v0.3.0) (2025-09-19)

### 中文版本

#### 新功能

* **格式化器：**
  为空行保留功能添加了全面的测试套件（[1fc51aa](https://github.com/tzzs/vsce-thrift-support/commit/1fc51aa318f16f24615ad9a1be31c78f65ae1914)）
* 添加 alignStructDefaults
  配置项，分离结构体默认值对齐与普通等号对齐（[f147809](https://github.com/tzzs/vsce-thrift-support/commit/f14780960d212ef7171948a3236f56ede786100c)）

### English Version

#### Features

* **formatter:** add comprehensive test suite for blank line
  preservation ([1fc51aa](https://github.com/tzzs/vsce-thrift-support/commit/1fc51aa318f16f24615ad9a1be31c78f65ae1914))
* Add alignStructDefaults configuration option to separate struct default value alignment from regular equals
  alignment ([f147809](https://github.com/tzzs/vsce-thrift-support/commit/f14780960d212ef7171948a3236f56ede786100c))

## [0.2.0](https://github.com/tzzs/vsce-thrift-support/compare/v0.1.4...v0.2.0) (2025-09-16)

### 中文版本

#### 新功能

* **测试：**
  添加结构体注解对齐测试用例（[5496214](https://github.com/tzzs/vsce-thrift-support/commit/5496214f9303b06d92dce91a740ec4e08b705e16)）
* **Thrift：**
  添加注解对齐格式化和测试（[61d13e8](https://github.com/tzzs/vsce-thrift-support/commit/61d13e8b36c2cf679a96a5385221d8cd687d7c71)）

#### 错误修复

* **格式化器：**
  确保结构体字段中逗号的紧密放置（[62172d5](https://github.com/tzzs/vsce-thrift-support/commit/62172d5d0a57c8c0bcff3f91eccbe7ec6de1efeb)）

### English Version

#### Features

* **tests:** add struct annotation alignment test
  cases ([5496214](https://github.com/tzzs/vsce-thrift-support/commit/5496214f9303b06d92dce91a740ec4e08b705e16))
* **thrift:** add annotation alignment formatting and
  tests ([61d13e8](https://github.com/tzzs/vsce-thrift-support/commit/61d13e8b36c2cf679a96a5385221d8cd687d7c71))

#### Bug Fixes

* **formatter:** ensure tight comma placement in struct
  fields ([62172d5](https://github.com/tzzs/vsce-thrift-support/commit/62172d5d0a57c8c0bcff3f91eccbe7ec6de1efeb))

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

* Implemented struct field annotation alignment formatting logic, maintaining stability when combined with type/field
  name/comment alignment options.
* Support for range format context.

#### Regression & Testing

* Added regression tests for test-files/main.thrift, ensuring trailing commas follow annotation text closely when
  annotation columns are aligned, with no extra spaces before commas; updated trailing comma test coverage (
  preserve/add/remove).
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

* Fixed block comment indentation and asterisk column alignment, making comments consistent with subsequent code
  indentation and "*" columns aligned.
* Maintained original order of const statements and their trailing line comments, preventing comments from being moved
  above const declarations.

#### Improvements

* Enhanced formatting strategy for collections (list/map/set/object) in constants:
    * collectionStyle=multiline: Inline collections are forced to expand to multiple lines.
    * collectionStyle=auto: Automatically expand to multiple lines when the entire line (including comments) exceeds
      maxLineLength.
    * Optimized multi-line collection item alignment and inline comment alignment for improved readability.
* More robust alignment width calculation (using adjusted field sets for alignment calculation), avoiding misalignment
  in edge cases.

#### Notes

* Configuration options collectionStyle (preserve/multiline/auto) and maxLineLength have more intuitive effects on "
  whether constant collections expand", recommended for use with team standards.

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

* Removed residual diff markers (+/-) in src/formatter.ts, fixing numerous TypeScript syntax errors (such as missing
  semicolons, unexpected keywords, etc.).
* Fixed parseConstField position and implementation, ensuring constant parsing works correctly within classes.
* Improved trailing comma handling logic: structs and enums behave consistently in preserve/add/remove modes, with test
  coverage passing.

#### Verification

* Passed npm run build and manual verification of key segments.

## 0.6.14 - 2025-10-10

### 中文版本
#### 修复
* 修复了嵌套容器类型中逗号的语法高亮问题，确保 `map<string, list<i32>>` 等复杂嵌套结构能正确高亮显示

### English Version
#### Fixes
* Fixed syntax highlighting for commas in nested container types, ensuring complex nested structures like `map<string, list<i32>>` are highlighted correctly

## 0.1.0 - 2025-09-13

### 中文版本

#### 新功能

* 初始版本：提供 Thrift 语法高亮、格式化与基础导航能力。

### English Version

#### Features

* Initial version: Provides Thrift syntax highlighting, formatting, and basic navigation capabilities.
