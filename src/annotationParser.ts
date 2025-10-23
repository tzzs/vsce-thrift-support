/**
 * Annotation Parser
 * 
 * This module provides functionality to parse Thrift annotations and create AST nodes
 * that preserve annotation information rather than stripping them away.
 */

import { AnnotationNode, AnnotationPair, AnnotationParseResult } from './astTypes';

/**
 * Parse annotation content from raw text
 * Handles nested parentheses, quoted strings, and escape sequences
 */
export function parseAnnotations(text: string, startOffset: number = 0): AnnotationParseResult {
    const annotations: AnnotationNode[] = [];
    const annotationRanges: Array<{start: number; end: number}> = [];
    let strippedText = text;
    let currentIndex = 0;

    while (currentIndex < text.length) {
        // Find the next annotation start
        const annotationStart = findAnnotationStart(text, currentIndex);
        if (annotationStart === -1) {
            break;
        }

        // Parse the complete annotation
        const annotationResult = parseSingleAnnotation(text, annotationStart, startOffset);
        if (annotationResult) {
            annotations.push(annotationResult.node);
            annotationRanges.push({
                start: annotationStart,
                end: annotationResult.endIndex
            });

            // Remove this annotation from the stripped text
            const beforeAnnotation = strippedText.substring(0, annotationStart);
            const afterAnnotation = strippedText.substring(annotationResult.endIndex + 1);
            strippedText = beforeAnnotation + afterAnnotation;
            
            // Adjust current index for next search - skip past this annotation
            currentIndex = annotationResult.endIndex + 1;
        } else {
            // If parsing failed, skip this position
            currentIndex = annotationStart + 1;
        }
    }

    return {
        annotations,
        strippedText: strippedText.trim(),
        annotationRanges
    };
}

/**
 * Find the start of the next annotation (opening parenthesis)
 * Skips parentheses inside quoted strings
 */
function findAnnotationStart(text: string, startIndex: number): number {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;

    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];

        // Handle escape sequences
        if (!escaped && ch === '\\') {
            escaped = true;
            continue;
        }

        // Handle quoted strings
        if (!escaped) {
            if (ch === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
                continue;
            }
            if (ch === '\'' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
                continue;
            }
        } else {
            escaped = false;
            continue;
        }

        // Look for annotation start outside of quoted strings
        if (!inSingleQuote && !inDoubleQuote && ch === '(') {
            return i;
        }
    }

    return -1;
}

/**
 * Parse a single annotation from the opening parenthesis
 */
function parseSingleAnnotation(text: string, startIndex: number, fileOffset: number): { node: AnnotationNode; endIndex: number } | null {
    if (text[startIndex] !== '(') {
        return null;
    }

    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;
    let parenDepth = 0;
    let annotationContent = '';

    // Find the matching closing parenthesis
    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];
        annotationContent += ch;

        // Handle escape sequences
        if (!escaped && ch === '\\') {
            escaped = true;
            continue;
        }

        // Handle quoted strings
        if (!escaped) {
            if (ch === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            } else if (ch === '\'' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            }
        } else {
            escaped = false;
        }

        // Track parentheses only outside quoted strings
        if (!inSingleQuote && !inDoubleQuote) {
            if (ch === '(') {
                parenDepth++;
            } else if (ch === ')') {
                parenDepth--;
                if (parenDepth === 0) {
                    // Found the matching closing parenthesis
                    const rawText = text.substring(startIndex, i + 1);
                    const pairs = parseAnnotationPairs(annotationContent.slice(1, -1)); // Remove parentheses
                    
                    const node: AnnotationNode = {
                        type: 'annotation',
                        rawText,
                        pairs,
                        startIndex: fileOffset + startIndex,
                        endIndex: fileOffset + i
                    };

                    return {
                        node,
                        endIndex: i
                    };
                }
            }
        }
    }

    // Unclosed annotation
    return null;
}

/**
 * Parse annotation key-value pairs from annotation content
 */
function parseAnnotationPairs(content: string): AnnotationPair[] {
    const pairs: AnnotationPair[] = [];
    const assignments = splitTopLevelAssignments(content);

    for (const assignment of assignments) {
        const pair = parseSingleAssignment(assignment.trim());
        if (pair) {
            pairs.push(pair);
        }
    }

    return pairs;
}

/**
 * Split annotation content into top-level assignments
 * Handles nested structures and quoted strings
 */
function splitTopLevelAssignments(content: string): string[] {
    const assignments: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        current += ch;

        // Handle escape sequences
        if (!escaped && ch === '\\') {
            escaped = true;
            continue;
        }

        // Handle quoted strings
        if (!escaped) {
            if (ch === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            } else if (ch === '\'' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            }
        } else {
            escaped = false;
        }

        // Track brackets only outside quoted strings
        if (!inSingleQuote && !inDoubleQuote) {
            if (ch === '{') braceDepth++;
            else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
            else if (ch === '[') bracketDepth++;
            else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
            else if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
        }

        // Split on comma at top level
        if (ch === ',' && !inSingleQuote && !inDoubleQuote && 
            braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
            const assignment = current.slice(0, -1).trim(); // Remove the comma
            if (assignment) {
                assignments.push(assignment);
            }
            current = '';
        }
    }

    // Add the last assignment
    const lastAssignment = current.trim();
    if (lastAssignment) {
        assignments.push(lastAssignment);
    }

    return assignments;
}

/**
 * Parse a single key-value assignment
 */
function parseSingleAssignment(assignment: string): AnnotationPair | null {
    // Handle simple assignments like key=value
    const simpleMatch = assignment.match(/^([A-Za-z_][A-Za-z0-9_\.]*)\s*=\s*(.+)$/);
    if (simpleMatch) {
        return {
            key: simpleMatch[1],
            value: simpleMatch[2].trim()
        };
    }

    // Handle nested object assignments like key{...}
    const objectMatch = assignment.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\{.*\})$/);
    if (objectMatch) {
        return {
            key: objectMatch[1],
            value: objectMatch[2].trim()
        };
    }

    // Handle simple keys without values (like deprecated annotations)
    if (assignment.match(/^[A-Za-z_][A-Za-z0-9_]*$/)) {
        return {
            key: assignment,
            value: ''
        };
    }

    return null;
}

/**
 * Extract annotations from a field line and return both the parsed annotations
 * and the line with annotations removed
 */
export function extractAnnotationsFromField(line: string): {
    fieldLine: string;
    annotations: AnnotationNode[];
} {
    const parseResult = parseAnnotations(line);
    
    // Reconstruct the field line without annotations
    let fieldLine = parseResult.strippedText;
    
    // Clean up any trailing whitespace or commas
    fieldLine = fieldLine.replace(/\s+$/, '');
    if (!fieldLine.endsWith(',') && !fieldLine.endsWith(';')) {
        fieldLine += ',';
    }

    return {
        fieldLine,
        annotations: parseResult.annotations
    };
}

/**
 * Create a stripped version of text with annotations removed
 * This is similar to stripTypeAnnotations but preserves annotation nodes
 */
export function stripAnnotationsWithNodes(text: string): { stripped: string; annotations: AnnotationNode[] } {
    const parseResult = parseAnnotations(text);
    return {
        stripped: parseResult.strippedText,
        annotations: parseResult.annotations
    };
}