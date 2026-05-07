/**
 * Thrift AST Node Types
 * 
 * This module defines the TypeScript interfaces for Thrift Abstract Syntax Tree nodes,
 * including support for annotation nodes that can be preserved during parsing.
 */

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
    type: string;
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

/**
 * Annotation key-value pair
 */
export interface AnnotationPair {
    key: string;
    value: string;
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

/**
 * Annotation node that can be attached to various Thrift constructs
 */
export interface AnnotationNode extends ASTNode {
    type: 'annotation';
    /** Raw annotation text including parentheses */
    rawText: string;
    /** Parsed annotation pairs */
    pairs: AnnotationPair[];
    /** Start position of the annotation in the source (including opening parenthesis) */
    startIndex: number;
    /** End position of the annotation in the source (including closing parenthesis) */
    endIndex: number;
}

/**
 * Field definition with annotation support
 */
export interface FieldNode extends ASTNode {
    type: 'field';
    fieldId: number;
    requiredness?: 'required' | 'optional';
    fieldType: string;
    name: string;
    defaultValue?: string;
    annotations?: AnnotationNode[];
    comment?: string;
    /** Raw field line for reference */
    rawLine: string;
}

/**
 * Struct/Union/Exception definition
 */
export interface StructNode extends ASTNode {
    type: 'struct' | 'union' | 'exception';
    name: string;
    fields: FieldNode[];
    annotations?: AnnotationNode[];
}

/**
 * Service definition
 */
export interface ServiceNode extends ASTNode {
    type: 'service';
    name: string;
    methods: MethodNode[];
    extends?: string;
    annotations?: AnnotationNode[];
}

/**
 * Service method definition
 */
export interface MethodNode extends ASTNode {
    type: 'method';
    returnType: string;
    name: string;
    parameters: FieldNode[];
    annotations?: AnnotationNode[];
    exceptions?: FieldNode[];
}

/**
 * Enum definition
 */
export interface EnumNode extends ASTNode {
    type: 'enum';
    name: string;
    values: EnumValueNode[];
    annotations?: AnnotationNode[];
}

/**
 * Enum value definition
 */
export interface EnumValueNode extends ASTNode {
    type: 'enumValue';
    name: string;
    value?: number;
    annotations?: AnnotationNode[];
}

/**
 * Typedef definition
 */
export interface TypedefNode extends ASTNode {
    type: 'typedef';
    name: string;
    targetType: string;
    annotations?: AnnotationNode[];
}

/**
 * Constant definition
 */
export interface ConstNode extends ASTNode {
    type: 'const';
    constType: string;
    name: string;
    value: string;
    annotations?: AnnotationNode[];
}

/**
 * Parse result containing all Thrift definitions
 */
export interface ThriftAST extends ASTNode {
    type: 'thrift';
    includes: string[];
    namespaces: Map<string, string>;
    definitions: Array<StructNode | ServiceNode | EnumNode | TypedefNode | ConstNode>;
}

/**
 * Annotation parser result
 */
export interface AnnotationParseResult {
    annotations: AnnotationNode[];
    strippedText: string;
    annotationRanges: Array<{start: number; end: number}>;
}