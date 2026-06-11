# Thrift Support Settings Reference

This reference covers the VS Code settings contributed by `package.json#contributes.configuration` and the legacy formatting fallback still accepted by the formatter.

The primary settings namespace is `thrift.*`.

## VS Code Settings

| Setting | Default | Values | Notes |
| --- | --- | --- | --- |
| `thrift.format.trailingComma` | `"preserve"` | `"preserve"`, `"add"`, `"remove"` | Controls trailing commas. Semicolon terminators are preserved and are never replaced with commas. |
| `thrift.format.alignTypes` | `true` | boolean | Aligns field types in structs, unions, and exceptions. |
| `thrift.format.alignNames` | `true` | boolean | Aligns struct field names and enum member names through one public switch. |
| `thrift.format.alignAssignments` | `true` | boolean | Master switch for struct field `=` and enum `=` / value alignment. Struct default value alignment is controlled separately. |
| `thrift.format.alignStructDefaults` | `false` | boolean | Aligns struct field default-value `=` signs. Independent from `alignAssignments`. |
| `thrift.format.alignAnnotations` | `true` | boolean | Aligns inline annotations for struct fields and enum members. |
| `thrift.format.alignComments` | `true` | boolean | Aligns inline comments. |
| `thrift.format.indentSize` | `4` | number | Number of spaces for indentation. VS Code formatter options can override this for a formatting request. |
| `thrift.format.maxLineLength` | `100` | number | Preferred maximum line length for formatting decisions. |
| `thrift.format.collectionStyle` | `"preserve"` | `"preserve"`, `"multiline"`, `"auto"` | Controls const collection formatting. |
| `thrift.diagnostics.debug` | `false` | boolean | Enables verbose diagnostics logging. |
| `thrift.diagnostics.rules` | `{}` | object | Per-rule enablement and severity overrides. See [diagnostics-rules.md](diagnostics-rules.md). |

## Formatting Example

```json
{
  "thrift.format.trailingComma": "preserve",
  "thrift.format.alignTypes": true,
  "thrift.format.alignNames": true,
  "thrift.format.alignAssignments": true,
  "thrift.format.alignStructDefaults": false,
  "thrift.format.alignAnnotations": true,
  "thrift.format.alignComments": true,
  "thrift.format.indentSize": 4,
  "thrift.format.maxLineLength": 100,
  "thrift.format.collectionStyle": "auto"
}
```

## Diagnostics Rule Overrides

Disable a rule:

```json
{
  "thrift.diagnostics.rules": {
    "service.oneway.returnNotVoid": false
  }
}
```

Change severity with a string:

```json
{
  "thrift.diagnostics.rules": {
    "field.duplicateId": "warning"
  }
}
```

Change severity with an object:

```json
{
  "thrift.diagnostics.rules": {
    "value.typeMismatch": {
      "enabled": true,
      "severity": "information"
    }
  }
}
```

Supported severity values are `error`, `warning`, `information`, and `hint`. Use `false` or `"off"` to disable a rule.

## Legacy Formatting Fallback

The current namespace is `thrift.format.*`. The formatter still reads legacy `thrift-support.formatting.*` values only when the matching `thrift.format.*` setting is unset. If both namespaces are set, the `thrift.format.*` value wins.

Accepted legacy keys:

```text
thrift-support.formatting.trailingComma
thrift-support.formatting.alignTypes
thrift-support.formatting.alignNames
thrift-support.formatting.alignFieldNames
thrift-support.formatting.alignEnumNames
thrift-support.formatting.alignAssignments
thrift-support.formatting.alignStructDefaults
thrift-support.formatting.alignAnnotations
thrift-support.formatting.alignStructAnnotations
thrift-support.formatting.alignComments
thrift-support.formatting.alignEnumEquals
thrift-support.formatting.alignEnumValues
thrift-support.formatting.indentSize
thrift-support.formatting.maxLineLength
thrift-support.formatting.collectionStyle
```

Example:

```json
{
  "thrift-support.formatting.indentSize": 2,
  "thrift-support.formatting.alignStructAnnotations": false
}
```

Prefer the new `thrift.format.*` keys for all new configuration. Hidden fine-grained compatibility switches such as `alignFieldNames`, `alignEnumNames`, `alignEnumEquals`, `alignEnumValues`, and `alignStructAnnotations` are intentionally not exposed in the settings UI.
