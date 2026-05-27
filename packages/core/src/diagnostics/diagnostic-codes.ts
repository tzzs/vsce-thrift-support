/**
 * Shared diagnostic code constants for Thrift IDL.
 *
 * Centralizing these strings prevents drift between the diagnostic rules
 * (which emit them) and the code-actions provider (which consumes them
 * to offer quick-fixes).
 */

export const DIAGNOSTIC_CODES = {
    /** Unknown type reference (struct field, const, service arg, etc.) */
    TYPE_UNKNOWN: 'type.unknown',
    /** Typedef references an unknown base type */
    TYPEDEF_UNKNOWN_BASE: 'typedef.unknownBase',
    /** Service method return type is unknown */
    SERVICE_RETURN_TYPE_UNKNOWN: 'service.returnType.unknown',
    /** Throws clause references an unknown type */
    SERVICE_THROWS_UNKNOWN: 'service.throws.unknown',
    /** Service extends an unknown parent */
    SERVICE_EXTENDS_UNKNOWN: 'service.extends.unknown',
    /** Service extends a type that is not a service */
    SERVICE_EXTENDS_NOT_SERVICE: 'service.extends.notService',
    /** oneway method return type is not void */
    SERVICE_ONEWAY_RETURN_NOT_VOID: 'service.oneway.returnNotVoid',
    /** oneway method has throws clause */
    SERVICE_ONEWAY_HAS_THROWS: 'service.oneway.hasThrows',
    /** throws clause references a non-exception type */
    SERVICE_THROWS_NOT_EXCEPTION: 'service.throws.notException',
    /** Duplicate field ID in struct/union/exception */
    FIELD_DUPLICATE_ID: 'field.duplicateId',
    /** Default value type mismatch with field type */
    VALUE_TYPE_MISMATCH: 'value.typeMismatch',
    /** Enum member value is not an integer literal */
    ENUM_VALUE_NOT_INTEGER: 'enum.valueNotInteger',
    /** Unmatched closing brace/paren */
    SYNTAX_UNMATCHED_CLOSER: 'syntax.unmatchedCloser',
    /** Mismatched brace/paren pair */
    SYNTAX_MISMATCHED: 'syntax.mismatched',
    /** Unclosed brace/paren */
    SYNTAX_UNCLOSED: 'syntax.unclosed',
} as const;

export type DiagnosticCode = typeof DIAGNOSTIC_CODES[keyof typeof DIAGNOSTIC_CODES];

/**
 * Diagnostic codes that indicate an unknown/unresolved type reference.
 * The code-actions provider uses this set to offer "Insert include" quick-fixes.
 */
export const UNKNOWN_TYPE_DIAGNOSTIC_CODES = new Set<string>([
    DIAGNOSTIC_CODES.TYPE_UNKNOWN,
    DIAGNOSTIC_CODES.SERVICE_RETURN_TYPE_UNKNOWN,
    DIAGNOSTIC_CODES.SERVICE_THROWS_UNKNOWN,
    DIAGNOSTIC_CODES.TYPEDEF_UNKNOWN_BASE,
]);
