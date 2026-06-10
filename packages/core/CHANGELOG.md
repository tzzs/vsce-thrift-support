# Changelog

## [3.1.0](https://github.com/tzzs/vsce-thrift-support/compare/core-v3.0.0...core-v3.1.0) (2026-06-10)


### Features

* add configurable diagnostics rule registry ([f5f93d4](https://github.com/tzzs/vsce-thrift-support/commit/f5f93d45f31209d7c985ff5bd49874837b1d818c))
* continue optimization roadmap ([325ae2f](https://github.com/tzzs/vsce-thrift-support/commit/325ae2f2eb898239567e70cab18576207dc11e45))


### Bug Fixes

* harden comment-aware hover and folding ([dfb9652](https://github.com/tzzs/vsce-thrift-support/commit/dfb9652d4e53020b3941f4f348755d9c21fe4df1))
* ignore comments in folding scans ([42cb354](https://github.com/tzzs/vsce-thrift-support/commit/42cb354dc2d25d8d8a2ba6320301dff8ca8c12b8))
* **providers:** harden rename diagnostics and cache handling ([1bded8c](https://github.com/tzzs/vsce-thrift-support/commit/1bded8c2378d69e0992442b017ff76330529c3c3))
* **providers:** harden rename diagnostics and cache handling ([ea14925](https://github.com/tzzs/vsce-thrift-support/commit/ea14925631e7fa6b304609edd5a737ff8dc6b209))
* **security:** harden include and cache boundaries ([d5b2f25](https://github.com/tzzs/vsce-thrift-support/commit/d5b2f259f5ceaadca79739ffb01e9a3ead32c926))
* **security:** harden include and cache boundaries ([82f7b98](https://github.com/tzzs/vsce-thrift-support/commit/82f7b988ca4c06d7dd9e3339c5002b1b34a3a159))

## [3.0.0](https://github.com/tzzs/vsce-thrift-support/compare/core-v2.2.0...core-v3.0.0) (2026-05-28)


### Features

* add monorepo core package and CLI tool (Phase 5 A/C/E) ([118d5fe](https://github.com/tzzs/vsce-thrift-support/commit/118d5fedc9745efc07e28f528d208b792172352f))
* enhance Thrift service handling with extendsRange and add shared diagnostic codes ([fbfaaaa](https://github.com/tzzs/vsce-thrift-support/commit/fbfaaaaacce43b0d0b64646765261f71bdf786cd))
* formatter engineering (Phase 0-4) + monorepo split + standalone CLI (Phase 5) ([144d3b6](https://github.com/tzzs/vsce-thrift-support/commit/144d3b6eee70d2065393cf4195e83a625edeee8a))
* implement Phase 6A-6D language providers for Thrift IDL ([d2dcd66](https://github.com/tzzs/vsce-thrift-support/commit/d2dcd66e206646fe551c4d7abde9c6cf5c795874))
* Phase 5 — monorepo split into packages/core, packages/vscode, packages/cli ([7911241](https://github.com/tzzs/vsce-thrift-support/commit/791124126e03084b34379fb3786362e76f6d7191))


### Bug Fixes

* **core:** fix incremental parse deletion bug, add depth guard to isKnownType, and consolidate shared utilities ([147c0a0](https://github.com/tzzs/vsce-thrift-support/commit/147c0a069d5cf1a68b4604973b4b604c3c5b3220))
* **diagnostics:** resolve multi-line default values to prevent false typeMismatch ([c480572](https://github.com/tzzs/vsce-thrift-support/commit/c4805724977e413e014f260c9efe841d1e65944d))
* **formatter:** correctly indent multi-line struct field default values ([2223cb4](https://github.com/tzzs/vsce-thrift-support/commit/2223cb4ca968b5882647c073f47e95f83ac632ee))
* **formatter:** correctly indent multi-line struct field default values ([3750144](https://github.com/tzzs/vsce-thrift-support/commit/37501447fcde0597cfbd7b20b756a334baec960d))
* **parser:** handle single-line enum body via countBraces; add boundary & concurrent tests ([4509ce5](https://github.com/tzzs/vsce-thrift-support/commit/4509ce581b8f29bc63bd7208fef0a291c4e2d99a))
* remove stale comment-map reference and const-printer ([f56f770](https://github.com/tzzs/vsce-thrift-support/commit/f56f770431498d0b0d03ec2cc39cc1dcb5ccdf84))
* **security:** remove space from regex type capture group (ReDoS) ([b57e09f](https://github.com/tzzs/vsce-thrift-support/commit/b57e09f728d3e9cbfba3e519dc851b441d950ccd))
* **security:** resolve CodeQL polynomial regex (ReDoS) warnings ([10792d9](https://github.com/tzzs/vsce-thrift-support/commit/10792d91b854d1693f5e3a5a052d8285ac82abe5))
