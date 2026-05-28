/**
 * Shared Thrift language constants used across multiple VS Code providers.
 * Centralised here to avoid duplicating these sets in every file that needs them.
 */

/** All primitive (scalar) types defined by the Thrift IDL specification. */
export const PRIMITIVE_TYPES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64',
    'double', 'string', 'binary', 'uuid', 'slist'
]);

/** Container type keywords that introduce parameterised types. */
export const CONTAINER_KEYWORDS = new Set<string>([
    'list', 'set', 'map', 'stream', 'sink'
]);
