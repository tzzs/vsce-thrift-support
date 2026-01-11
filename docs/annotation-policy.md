# Annotation Semantics Policy

This extension treats Thrift field/type annotations as semantically opaque content to avoid false positives and retain
compatibility with diverse generator ecosystems (e.g., `go.tag`). The goal is to ensure annotations never break Thrift
syntax analysis while not enforcing any annotation-specific rules.

Key points:

- Opaque content: Annotation keys and values are not validated. The extension does not enforce allowed keys, value
  formats, or Go tag conventions.
- String-aware scanning: Quotes (`'`/`"`) and escapes (`\\`) inside annotation values are tracked so any brackets within
  string literals do not affect structural parsing.
- Balanced parentheses only: Only the outer `(...)` of annotations is considered for locating annotation boundaries;
  inner content is ignored for syntax balancing.
- Angle bracket matching: `>` matches only when the current stack top is `<`, and never inside quoted strings. This
  prevents `>` in annotation strings from being treated as a structural close.

Examples:

```thrift
struct User {
  1: optional string name (go.tag="json:\"name,omitempty\" validate:\"required\"")
  2: optional i32    age  (python.immutable = "true")
}
```

Behavior:

- No diagnostics are emitted based on annotation content.
- Global brace/bracket balance diagnostics ignore symbols inside quoted annotation values.
- Container type `<...>` validation operates only on type contexts and never on annotation text.

This policy maintains robust syntax analysis while remaining compatible with a wide variety of annotation usages.