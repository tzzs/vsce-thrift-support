# Diagnostics Rules

Diagnostics use stable rule IDs in the `code` field. Rule IDs can be disabled or have severity overridden from `.thriftrc.json` and VS Code settings.

## Configuration

`.thriftrc.json`:

```json
{
  "diagnostics": {
    "rules": {
      "field.duplicateId": "warning",
      "service.oneway.returnNotVoid": "off"
    }
  }
}
```

VS Code `settings.json`:

```json
{
  "thrift.diagnostics.rules": {
    "field.duplicateId": {
      "enabled": true,
      "severity": "warning"
    },
    "service.oneway.returnNotVoid": false
  }
}
```

Supported severity values are `error`, `warning`, `information`, and `hint`. Use `false` or `off` to disable a rule.

## Rule Catalog

| Rule ID | Default | Category | Quick Fix |
| --- | --- | --- | --- |
| `type.unknown` | error | type | yes |
| `typedef.unknownBase` | error | type | yes |
| `service.returnType.unknown` | error | service | yes |
| `service.throws.unknown` | error | service | yes |
| `service.extends.unknown` | error | service | no |
| `service.extends.notService` | error | service | no |
| `service.oneway.returnNotVoid` | error | service | yes |
| `service.oneway.hasThrows` | error | service | no |
| `service.throws.notException` | error | service | no |
| `field.duplicateId` | error | field | yes |
| `value.typeMismatch` | warning | value | no |
| `enum.valueNotInteger` | error | enum | no |
| `syntax.unmatchedCloser` | error | syntax | no |
| `syntax.mismatched` | error | syntax | no |
| `syntax.unclosed` | error | syntax | no |
