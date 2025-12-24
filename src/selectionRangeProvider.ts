import * as vscode from 'vscode';

export class ThriftSelectionRangeProvider implements vscode.SelectionRangeProvider {
    provideSelectionRanges(
        document: vscode.TextDocument,
        positions: vscode.Position[],
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SelectionRange[]> {
        const result: vscode.SelectionRange[] = [];
        
        // Debug logging for specific positions
        for (const position of positions) {
            if (position.line === 2 && position.character === 20) {
                console.log('DEBUG: provideSelectionRanges called for position (2, 20)');
            }
        }
        
        for (const position of positions) {
            if (token.isCancellationRequested) {
                break;
            }
            
            const ranges = this.getSelectionRanges(document, position);
            if (ranges.length > 0) {
                result.push(ranges[0]);
            }
        }
        
        return result;
    }

    private getSelectionRanges(document: vscode.TextDocument, position: vscode.Position): vscode.SelectionRange[] {
        const ranges: vscode.SelectionRange[] = [];
        
        // Handle empty documents
        if (document.getText().trim() === '') {
            return ranges;
        }
        
        // Start with word selection
        this.expandToWords(document, position, ranges);
        
        // Expand to specific language constructs
        this.expandToFieldDefinitions(document, position, ranges);
        this.expandToMethodSignatures(document, position, ranges);
        this.expandToNamespaceDefinitions(document, position, ranges);
        this.expandToIncludeStatements(document, position, ranges);
        
        // Expand to lines and blocks
        this.expandToLines(document, position, ranges);
        this.expandToBlocks(document, position, ranges);
        this.expandToTypeDefinitions(document, position, ranges);
        
        return ranges;
    }

    private expandToWords(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const currentLine = lines[position.line];
        
        // Find word boundaries - handle complex types like list<string>, map<string, i32>
        let start = position.character;
        let end = position.character;
        
        // First, try to expand as a simple word (for field names, etc.)
        let simpleStart = position.character;
        let simpleEnd = position.character;
        
        // Expand left for simple word characters only
        while (simpleStart > 0 && /[\w\d_]/.test(currentLine[simpleStart - 1])) {
            simpleStart--;
        }
        
        // Expand right for simple word characters only
        while (simpleEnd < currentLine.length && /[\w\d_]/.test(currentLine[simpleEnd])) {
            simpleEnd++;
        }
        
        // Check if this looks like a complex type (contains angle brackets)
        // If so, expand to include angle brackets and commas
        let complexStart = simpleStart;
        let complexEnd = simpleEnd;
        
        // Look for angle brackets around the current position
        let hasAngleBrackets = false;
        
        // Check if we're inside angle brackets or if there are angle brackets nearby
        let searchStart = Math.max(0, position.character - 20);
        let searchEnd = Math.min(currentLine.length, position.character + 20);
        const nearbyText = currentLine.substring(searchStart, searchEnd);
        
        if (nearbyText.includes('<') || nearbyText.includes('>')) {
            hasAngleBrackets = true;
        }
        
        if (hasAngleBrackets) {
            // Expand left for complex types
            while (complexStart > 0 && /[\w\d_<>,]/.test(currentLine[complexStart - 1])) {
                complexStart--;
            }
            
            // Expand right for complex types
            while (complexEnd < currentLine.length && /[\w\d_<>,]/.test(currentLine[complexEnd])) {
                complexEnd++;
            }
            
            if (complexStart < complexEnd) {
                const range = new vscode.Range(position.line, complexStart, position.line, complexEnd);
                this.addRangeIfLarger(ranges, range);
            }
        } else {
            // Use simple word expansion (excludes commas)
            if (simpleStart < simpleEnd) {
                const range = new vscode.Range(position.line, simpleStart, position.line, simpleEnd);
                this.addRangeIfLarger(ranges, range);
            }
        }
    }

    private expandToFieldDefinitions(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const currentLine = lines[position.line];
        
        // Field definition pattern: [fieldId]: [requiredness]? [type] [name] [= defaultValue]? [,;]?
        // Type can be simple (i32, string) or complex (list<string>, map<string, i32>)
        // Use a more robust approach to handle nested angle brackets
        const fieldMatch = currentLine.match(/^(\s*)(\d+):\s*(required|optional)?\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]*>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        
        if (fieldMatch && fieldMatch.index !== undefined) {
            const fullField = fieldMatch[0];
            const fieldIndex = fieldMatch.index;
            const fieldId = fieldMatch[2];
            const requiredness = fieldMatch[3];
            const fieldType = fieldMatch[4];
            const fieldName = fieldMatch[5];
            
            // Calculate positions for each component
            const fieldIdStart = fieldIndex + fieldMatch[1].length; // fieldMatch[1] is whitespace
            const fieldIdEnd = fieldIdStart + fieldId.length;
            
            let requirednessStart = -1;
            let requirednessEnd = -1;
            if (requiredness) {
                requirednessStart = fieldIdEnd + 2; // ": " after fieldId
                requirednessEnd = requirednessStart + requiredness.length;
            }
            
            const typeStart = currentLine.indexOf(fieldType, requiredness ? requirednessEnd : fieldIdEnd + 2);
            const typeEnd = typeStart + fieldType.length;
            
            const nameStart = currentLine.indexOf(fieldName, typeEnd);
            const nameEnd = nameStart + fieldName.length;
            
            // Determine which component the position is on
            const isOnFieldId = position.character >= fieldIdStart && position.character < fieldIdEnd;
            const isOnRequiredness = requiredness && position.character >= requirednessStart && position.character < requirednessEnd;
            const isOnType = position.character >= typeStart && position.character < typeEnd;
            const isOnName = position.character >= nameStart && position.character < nameEnd;
            
            // Check if position is between components (on whitespace)
            const isBetweenFieldIdAndRequiredness = requiredness && position.character >= fieldIdEnd && position.character < requirednessStart;
            const isBetweenRequirednessAndType = position.character >= (requiredness ? requirednessEnd : fieldIdEnd + 2) && position.character < typeStart;
            const isBetweenTypeAndName = position.character >= typeEnd && position.character < nameStart;
            
            // Distance-based selection for whitespace
            const minDistanceToType = Math.min(
                Math.abs(position.character - typeStart),
                Math.abs(position.character - typeEnd)
            );
            const minDistanceToRequiredness = requiredness ? Math.min(
                Math.abs(position.character - requirednessStart),
                Math.abs(position.character - requirednessEnd)
            ) : Infinity;
            const minDistanceToName = Math.min(
                Math.abs(position.character - nameStart),
                Math.abs(position.character - nameEnd)
            );
            
            // Prefer selection of nearest component when on whitespace
            const isJustAfterRequiredness = isBetweenRequirednessAndType && minDistanceToRequiredness <= minDistanceToType && minDistanceToType > 0;
            const isJustAfterType = isBetweenTypeAndName && minDistanceToType <= minDistanceToName && minDistanceToName > 0;
            const isNearType = isBetweenRequirednessAndType || isOnType || isBetweenTypeAndName;
            const isNearRequiredness = isBetweenFieldIdAndRequiredness || isOnRequiredness || isBetweenRequirednessAndType;
            const isNearName = isBetweenTypeAndName || isOnName;
            
            // Debug logging for position (1, 13) and (1, 20)
            if ((position.line === 1 && position.character === 13) || (position.line === 1 && position.character === 20)) {
                console.log('DEBUG: Field definition analysis:');
                console.log('  Full match:', JSON.stringify(fieldMatch[0]));
                console.log('  Field ID:', fieldId, 'at positions', fieldIdStart, 'to', fieldIdEnd);
                console.log('  Requiredness:', requiredness, 'at positions', requirednessStart, 'to', requirednessEnd);
                console.log('  Type:', fieldType, 'at positions', typeStart, 'to', typeEnd);
                console.log('  Name:', fieldName, 'at positions', nameStart, 'to', nameEnd);
                console.log('  Current position:', position.character);
                console.log('  isOnFieldId:', isOnFieldId);
                console.log('  isOnRequiredness:', isOnRequiredness);
                console.log('  isOnType:', isOnType);
                console.log('  isOnName:', isOnName);
                console.log('  isBetweenRequirednessAndType:', isBetweenRequirednessAndType);
                console.log('  isBetweenTypeAndName:', isBetweenTypeAndName);
                console.log('  minDistanceToType:', minDistanceToType);
                console.log('  minDistanceToRequiredness:', minDistanceToRequiredness);
                console.log('  minDistanceToName:', minDistanceToName);
                console.log('  isNearType:', isNearType);
                console.log('  isNearRequiredness:', isNearRequiredness);
                console.log('  isNearName:', isNearName);
                console.log('  isJustAfterRequiredness:', isJustAfterRequiredness);
                console.log('  Selection conditions:');
                console.log('    isNearName && minDistanceToName <= minDistanceToType && minDistanceToName <= minDistanceToRequiredness:', isNearName && minDistanceToName <= minDistanceToType && minDistanceToName <= minDistanceToRequiredness);
                console.log('    isNearType || isJustAfterRequiredness:', isNearType || isJustAfterRequiredness);
                console.log('    minDistanceToType < minDistanceToRequiredness + 2:', minDistanceToType < minDistanceToRequiredness + 2);
                console.log('    minDistanceToType < minDistanceToRequiredness + 2 || isJustAfterRequiredness:', minDistanceToType < minDistanceToRequiredness + 2 || isJustAfterRequiredness);
            }
            
            let fieldComponentSelected = false;
            
            // Debug logging for position (1, 13) and (2, 20)
            if ((position.line === 1 && position.character === 13) || (position.line === 2 && position.character === 20)) {
                console.log('DEBUG: Starting component selection logic:');
                console.log('  isOnName:', isOnName);
                console.log('  isOnType:', isOnType);
                console.log('  isOnRequiredness:', isOnRequiredness);
                console.log('  isOnFieldId:', isOnFieldId);
                console.log('  isNearName:', isNearName);
                console.log('  isNearType:', isNearType);
                console.log('  isNearRequiredness:', isNearRequiredness);
                console.log('  isJustAfterRequiredness:', isJustAfterRequiredness);
                console.log('  isJustAfterType:', isJustAfterType);
                console.log('  minDistanceToType:', minDistanceToType);
                console.log('  minDistanceToRequiredness:', minDistanceToRequiredness);
                console.log('  minDistanceToName:', minDistanceToName);
                console.log('  isNearName || isJustAfterType:', isNearName || isJustAfterType);
                console.log('  minDistanceToName < minDistanceToType + 2:', minDistanceToName < minDistanceToType + 2);
                console.log('  minDistanceToName < minDistanceToType + 2 || isJustAfterType:', minDistanceToName < minDistanceToType + 2 || isJustAfterType);
            }
            
            // Select specific component based on position
            if (isOnName) {
                const nameRange = new vscode.Range(position.line, nameStart, position.line, nameEnd);
                this.addRangeIfLarger(ranges, nameRange);
                fieldComponentSelected = true;
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected name component');
            } else if (isOnType) {
                const typeRange = new vscode.Range(position.line, typeStart, position.line, typeEnd);
                this.addRangeIfLarger(ranges, typeRange);
                fieldComponentSelected = true;
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected type component');
            } else if (isOnRequiredness && requiredness) {
                const requirednessRange = new vscode.Range(position.line, requirednessStart, position.line, requirednessEnd);
                this.addRangeIfLarger(ranges, requirednessRange);
                fieldComponentSelected = true;
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected requiredness component');
            } else if (isOnFieldId) {
                const fieldIdRange = new vscode.Range(position.line, fieldIdStart, position.line, fieldIdEnd);
                this.addRangeIfLarger(ranges, fieldIdRange);
                fieldComponentSelected = true;
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected field ID component');
            } else if (isNearName || isJustAfterType) {
                // Prefer name over type when distances are close (within 2 characters)
                // This handles the case where cursor is at the boundary between type and name
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Checking name/type condition:', minDistanceToName < minDistanceToType + 2 || isJustAfterType);
                if (minDistanceToName < minDistanceToType + 2 || isJustAfterType) {
                    // For component selection, we want to replace the current selection with the specific component
                    // Remove any existing component ranges and add the name range as the primary selection
                    const nameRange = new vscode.Range(position.line, nameStart, position.line, nameEnd);
                    
                    // If we already have ranges, make the name range the primary selection
                    if (ranges.length > 0) {
                        // Create a new selection range for the name and set it as the first range
                        const nameSelectionRange = new vscode.SelectionRange(nameRange);
                        nameSelectionRange.parent = ranges[ranges.length - 1];
                        ranges.unshift(nameSelectionRange); // Add to beginning for priority
                    } else {
                        ranges.push(new vscode.SelectionRange(nameRange));
                    }
                    fieldComponentSelected = true;
                    if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected name component (whitespace) - added to beginning');
                } else if (isNearName) {
                    const nameRange = new vscode.Range(position.line, nameStart, position.line, nameEnd);
                    this.addRangeIfLarger(ranges, nameRange);
                    fieldComponentSelected = true;
                    if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected name component (whitespace) - normal');
                }
            } else if (isNearType || isJustAfterRequiredness) {
                // Prefer type over requiredness when distances are close (within 2 characters)
                // This handles the case where cursor is at the boundary between components
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Checking type/requiredness condition:', minDistanceToType < minDistanceToRequiredness + 2 || isJustAfterRequiredness);
                if (minDistanceToType < minDistanceToRequiredness + 2 || isJustAfterRequiredness) {
                    // For component selection, we want to replace the current selection with the specific component
                    // Remove any existing component ranges and add the type range as the primary selection
                    const typeRange = new vscode.Range(position.line, typeStart, position.line, typeEnd);
                    
                    // If we already have ranges, make the type range the primary selection
                    if (ranges.length > 0) {
                        // Create a new selection range for the type and set it as the first range
                        const typeSelectionRange = new vscode.SelectionRange(typeRange);
                        typeSelectionRange.parent = ranges[ranges.length - 1];
                        ranges.unshift(typeSelectionRange); // Add to beginning for priority
                    } else {
                        ranges.push(new vscode.SelectionRange(typeRange));
                    }
                    fieldComponentSelected = true;
                    if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected type component (whitespace) - added to beginning');
                } else if (requiredness) {
                    const requirednessRange = new vscode.Range(position.line, requirednessStart, position.line, requirednessEnd);
                    this.addRangeIfLarger(ranges, requirednessRange);
                    fieldComponentSelected = true;
                    if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected requiredness component (whitespace)');
                }
            } else if (isNearRequiredness && requiredness) {
                // Only near requiredness
                const requirednessRange = new vscode.Range(position.line, requirednessStart, position.line, requirednessEnd);
                this.addRangeIfLarger(ranges, requirednessRange);
                fieldComponentSelected = true;
                if (position.line === 1 && position.character === 13) console.log('DEBUG: Selected requiredness component (only near)');
            }

            // If we've selected a field component, add the full field range as parent and return early
            if (fieldComponentSelected) {
                // Add the full field range as the parent of the component range
                const fieldRange = new vscode.Range(position.line, fieldIndex, position.line, fieldIndex + fullField.length);
                
                // Create the field range and link it as parent to the last range (which should be the component)
                const fieldSelectionRange = new vscode.SelectionRange(fieldRange);
                if (ranges.length > 0) {
                    ranges[ranges.length - 1].parent = fieldSelectionRange;
                }
                ranges.push(fieldSelectionRange);
                
                // Add the containing type definition as parent
                const containingType = this.findContainingTypeDefinition(lines, position.line);
                if (containingType && containingType.end >= 0 && containingType.end < lines.length) {
                    const typeRange = new vscode.Range(containingType.start, 0, containingType.end, lines[containingType.end].length);
                    const typeSelectionRange = new vscode.SelectionRange(typeRange);
                    fieldSelectionRange.parent = typeSelectionRange;
                    ranges.push(typeSelectionRange);
                }
                
                // Return early to prevent general type reference matching from overriding our selection
                return;
            }

            // No field component selected, add the full field range
            const fieldRange = new vscode.Range(position.line, fieldIndex, position.line, fieldIndex + fullField.length);
            this.addRangeIfLarger(ranges, fieldRange);
            
            // Add the containing type definition as parent
            const containingType = this.findContainingTypeDefinition(lines, position.line);
            if (containingType && containingType.end >= 0 && containingType.end < lines.length) {
                const typeRange = new vscode.Range(containingType.start, 0, containingType.end, lines[containingType.end].length);
                const typeSelectionRange = new vscode.SelectionRange(typeRange);
                if (ranges.length > 0) {
                    ranges[ranges.length - 1].parent = typeSelectionRange;
                }
                ranges.push(typeSelectionRange);
            }

            // Return early to prevent general type reference matching from overriding our selection
            // when we're dealing with field definitions
            return;
        }
    }

    private expandToMethodSignatures(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const currentLine = lines[position.line];
        
        // Method definition pattern: [oneway]? [returnType] [methodName]([parameters])
        const methodMatch = currentLine.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        
        if (methodMatch && methodMatch.index !== undefined) {
            const returnType = methodMatch[3];
            const methodName = methodMatch[4];
            
            // Calculate positions based on the regex match
            const leadingWhitespaceLength = methodMatch[1].length;
            const onewayLength = methodMatch[2] ? methodMatch[2].length : 0;
            const returnTypeStart = methodMatch.index + leadingWhitespaceLength + onewayLength;
            const methodNameStart = returnTypeStart + returnType.length + 1; // +1 for the space between return type and method name
            
            // Debug logging for position (1, 6)
            if (position.line === 1 && position.character === 6) {
                console.log('DEBUG: Method signature analysis:');
                console.log('  Full match:', JSON.stringify(methodMatch[0]));
                console.log('  Return type:', JSON.stringify(returnType), 'at position', returnTypeStart);
                console.log('  Method name:', JSON.stringify(methodName), 'at position', methodNameStart);
                console.log('  Current position:', position.character);
                console.log('  Return type spans:', returnTypeStart, 'to', returnTypeStart + returnType.length);
                console.log('  Method name spans:', methodNameStart, 'to', methodNameStart + methodName.length);
            }
            
            // Check if position is on method name (excluding trailing space)
            if (position.character >= methodNameStart && position.character < methodNameStart + methodName.length) {
                const methodNameRange = new vscode.Range(position.line, methodNameStart, position.line, methodNameStart + methodName.length);
                this.addRangeIfLarger(ranges, methodNameRange);
                
                // Find the end of the method signature
                const openParenIndex = currentLine.indexOf('(', methodNameStart + methodName.length);
                let closeParenIndex = -1;
                let parenDepth = 0;

                for (let i = openParenIndex; i < currentLine.length; i++) {
                    if (currentLine[i] === '(') {
                        parenDepth++;
                    } else if (currentLine[i] === ')') {
                        parenDepth--;
                        if (parenDepth === 0) {
                            closeParenIndex = i;
                            break;
                        }
                    }
                }

                if (closeParenIndex > 0) {
                    const methodSignatureRange = new vscode.Range(position.line, methodMatch.index, position.line, closeParenIndex + 1);
                    if (ranges.length > 0) {
                        ranges[ranges.length - 1].parent = new vscode.SelectionRange(methodSignatureRange);
                    }
                    
                    // Add the containing service block as parent
                    const containingService = this.findContainingTypeDefinition(lines, position.line);
                    if (containingService && containingService.end >= 0 && containingService.end < lines.length) {
                        const serviceRange = new vscode.Range(containingService.start, 0, containingService.end, lines[containingService.end].length);
                        const serviceSelectionRange = new vscode.SelectionRange(serviceRange);
                        
                        // Find the method signature range and set its parent
                        if (ranges.length > 0) {
                            ranges[ranges.length - 1].parent = serviceSelectionRange;
                        }
                        ranges.push(serviceSelectionRange);
                    }
                }
                return;
            }
            
            // Check if position is on return type (excluding trailing space)
            if (position.character >= returnTypeStart && position.character < returnTypeStart + returnType.length) {
                // Find the actual end of the return type (excluding trailing spaces)
                let returnTypeActualEnd = returnTypeStart + returnType.length;
                while (returnTypeActualEnd < currentLine.length && /\s/.test(currentLine[returnTypeActualEnd])) {
                    returnTypeActualEnd++;
                }
                
                // Only select return type if position is actually within the type text
                if (position.character < returnTypeStart + returnType.length) {
                    const returnTypeRange = new vscode.Range(position.line, returnTypeStart, position.line, returnTypeStart + returnType.length);
                    this.addRangeIfLarger(ranges, returnTypeRange);
                    
                    // Find the end of the method signature
                    const openParenIndex = currentLine.indexOf('(', methodNameStart + methodName.length);
                    let closeParenIndex = -1;
                    let parenDepth = 0;

                    for (let i = openParenIndex; i < currentLine.length; i++) {
                        if (currentLine[i] === '(') {
                            parenDepth++;
                        } else if (currentLine[i] === ')') {
                            parenDepth--;
                            if (parenDepth === 0) {
                                closeParenIndex = i;
                                break;
                            }
                        }
                    }

                    if (closeParenIndex > 0) {
                        const methodSignatureRange = new vscode.Range(position.line, methodMatch.index, position.line, closeParenIndex + 1);
                        if (ranges.length > 0) {
                            ranges[ranges.length - 1].parent = new vscode.SelectionRange(methodSignatureRange);
                        }
                        
                        // Add the containing service block as parent
                        const containingService = this.findContainingTypeDefinition(lines, position.line);
                        if (containingService && containingService.end >= 0 && containingService.end < lines.length) {
                            const serviceRange = new vscode.Range(containingService.start, 0, containingService.end, lines[containingService.end].length);
                            const serviceSelectionRange = new vscode.SelectionRange(serviceRange);
                            
                            // Find the method signature range and set its parent
                            if (ranges.length > 0) {
                                ranges[ranges.length - 1].parent = serviceSelectionRange;
                            }
                            ranges.push(serviceSelectionRange);
                        }
                    }
                }
                return;
            }
            
            // Check if position is on whitespace between return type and method name
            const isOnWhitespace = position.character >= returnTypeStart + returnType.length && position.character < methodNameStart;
            if (position.line === 1 && position.character === 6) {
                console.log('DEBUG: Whitespace detection:');
                console.log('  isOnWhitespace:', isOnWhitespace);
                console.log('  Condition:', position.character, '>=', returnTypeStart + returnType.length, '&&', position.character, '<', methodNameStart);
            }
            
            if (isOnWhitespace) {
                // Prefer method name when on whitespace between components
                const methodNameRange = new vscode.Range(position.line, methodNameStart, position.line, methodNameStart + methodName.length);
                
                // Debug logging for position (1, 6)
                if (position.line === 1 && position.character === 6) {
                    console.log('DEBUG: Adding method name range for whitespace position');
                    console.log('  Method name range:', methodNameRange.start.character, 'to', methodNameRange.end.character);
                }
                
                // For whitespace, we want method name as the primary selection
                const methodNameSelectionRange = new vscode.SelectionRange(methodNameRange);
                ranges.unshift(methodNameSelectionRange); // Add to beginning for priority
                
                // Find the end of the method signature
                const openParenIndex = currentLine.indexOf('(', methodNameStart + methodName.length);
                let closeParenIndex = -1;
                let parenDepth = 0;

                for (let i = openParenIndex; i < currentLine.length; i++) {
                    if (currentLine[i] === '(') {
                        parenDepth++;
                    } else if (currentLine[i] === ')') {
                        parenDepth--;
                        if (parenDepth === 0) {
                            closeParenIndex = i;
                            break;
                        }
                    }
                }

                if (closeParenIndex > 0) {
                    const methodSignatureRange = new vscode.Range(position.line, methodMatch.index, position.line, closeParenIndex + 1);
                    methodNameSelectionRange.parent = new vscode.SelectionRange(methodSignatureRange);
                    
                    // Add the containing service block as parent
                    const containingService = this.findContainingTypeDefinition(lines, position.line);
                    if (containingService && containingService.end >= 0 && containingService.end < lines.length) {
                        const serviceRange = new vscode.Range(containingService.start, 0, containingService.end, lines[containingService.end].length);
                        const serviceSelectionRange = new vscode.SelectionRange(serviceRange);
                        methodNameSelectionRange.parent.parent = serviceSelectionRange;
                    }
                }
                return;
            }
            
            // If position is not on a specific component, select the full method signature
            const openParenIndex = currentLine.indexOf('(');
            let closeParenIndex = -1;
            let parenDepth = 0;

            for (let i = openParenIndex; i < currentLine.length; i++) {
                if (currentLine[i] === '(') {
                    parenDepth++;
                } else if (currentLine[i] === ')') {
                    parenDepth--;
                    if (parenDepth === 0) {
                        closeParenIndex = i;
                        break;
                    }
                }
            }

            if (closeParenIndex > 0) {
                const methodSignature = currentLine.substring(methodMatch.index!, closeParenIndex + 1);
                const range = new vscode.Range(position.line, methodMatch.index!, position.line, closeParenIndex + 1);
                this.addRangeIfLarger(ranges, range);
                
                // Add the containing service block as parent
                const containingService = this.findContainingTypeDefinition(lines, position.line);
                if (containingService && containingService.end >= 0 && containingService.end < lines.length) {
                    const serviceRange = new vscode.Range(containingService.start, 0, containingService.end, lines[containingService.end].length);
                    const serviceSelectionRange = new vscode.SelectionRange(serviceRange);
                    if (ranges.length > 0) {
                        ranges[ranges.length - 1].parent = serviceSelectionRange;
                    }
                }
            }
        }
    }

    private expandToNamespaceDefinitions(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const currentLine = lines[position.line];
        
        // Namespace definition pattern: namespace [language] [package]
        const namespaceMatch = currentLine.match(/^(\s*)namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        
        if (namespaceMatch && namespaceMatch.index !== undefined) {
            const fullNamespaceRange = new vscode.Range(position.line, 0, position.line, currentLine.length);
            
            // Check if position is on the language part (second component)
            const languageStart = currentLine.indexOf(namespaceMatch[2]);
            const languageEnd = languageStart + namespaceMatch[2].length;
            
            if (position.character >= languageStart && position.character < languageEnd) {
                // Position is on the language part, create hierarchy: language -> full line
                // Add ranges in reverse order: first the specific range, then the general range
                const languageRange = new vscode.Range(position.line, languageStart, position.line, languageEnd);
                const languageSelectionRange = new vscode.SelectionRange(languageRange);
                languageSelectionRange.parent = new vscode.SelectionRange(fullNamespaceRange);
                
                // Insert at the beginning so the specific range comes first
                ranges.unshift(languageSelectionRange);
            } else {
                // Position is elsewhere, just add the full line
                this.addRangeIfLarger(ranges, fullNamespaceRange);
            }
        }
    }

    private expandToIncludeStatements(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const currentLine = lines[position.line];
        
        // Include statement pattern: include "filename"
        const includeMatch = currentLine.match(/^(\s*)include\s+["']([^"']+)["']/);
        
        if (includeMatch && includeMatch.index !== undefined) {
            const filename = includeMatch[2];
            const filenameStart = currentLine.indexOf(filename);
            const filenameEnd = filenameStart + filename.length;
            
            // Check if position is on the filename part
            if (position.character >= filenameStart && position.character <= filenameEnd) {
                // Select just the filename first, then the full line as parent
                const filenameRange = new vscode.Range(position.line, filenameStart, position.line, filenameEnd);
                const filenameSelectionRange = new vscode.SelectionRange(filenameRange);
                filenameSelectionRange.parent = new vscode.SelectionRange(new vscode.Range(position.line, 0, position.line, currentLine.length));
                ranges.unshift(filenameSelectionRange);
            } else {
                // Position is elsewhere, just add the full line
                const range = new vscode.Range(position.line, 0, position.line, currentLine.length);
                this.addRangeIfLarger(ranges, range);
            }
        }
    }

    private expandToLines(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const currentLineLength = lines[position.line].length;
        const currentLineRange = new vscode.Range(position.line, 0, position.line, currentLineLength);
        this.addRangeIfLarger(ranges, currentLineRange);
        
        // Try to expand to logical line groups
        const logicalRange = this.findLogicalLineRange(lines, position.line);
        if (logicalRange && logicalRange.end >= 0 && logicalRange.end < lines.length) {
            const range = new vscode.Range(logicalRange.start, 0, logicalRange.end, lines[logicalRange.end].length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private expandToBlocks(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }
        
        const blockRange = this.findContainingBlock(lines, position.line);
        if (blockRange && blockRange.end >= 0 && blockRange.end < lines.length) {
            const range = new vscode.Range(blockRange.start, 0, blockRange.end, lines[blockRange.end].length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private expandToTypeDefinitions(document: vscode.TextDocument, position: vscode.Position, ranges: vscode.SelectionRange[]): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Bounds checking
        if (position.line < 0 || position.line >= lines.length) {
            return;
        }

        // Find the containing type definition
        const typeDef = this.findContainingTypeDefinition(lines, position.line);
        if (typeDef && typeDef.end >= 0 && typeDef.end < lines.length) {
            const range = new vscode.Range(typeDef.start, 0, typeDef.end, lines[typeDef.end].length);
            this.addRangeIfLarger(ranges, range);
        }
    }

    private addRangeIfLarger(ranges: vscode.SelectionRange[], newRange: vscode.Range): void {
        // Debug logging for position (1, 6)
        if (newRange.start.line === 1 && newRange.start.character === 7 && newRange.end.character === 14) {
            console.log('DEBUG: addRangeIfLarger called with method name range');
            console.log('  Current ranges length:', ranges.length);
            console.log('  New range:', newRange.start.character, 'to', newRange.end.character);
            if (ranges.length > 0) {
                console.log('  Last range:', ranges[ranges.length - 1].range.start.character, 'to', ranges[ranges.length - 1].range.end.character);
                console.log('  isRangeLarger result:', this.isRangeLarger(newRange, ranges[ranges.length - 1].range));
            }
        }
        
        // Check if this range is larger than the last one
        if (ranges.length === 0 || this.isRangeLarger(newRange, ranges[ranges.length - 1].range)) {
            // Create a linked list of selection ranges
            const newSelectionRange = new vscode.SelectionRange(newRange);
            if (ranges.length > 0) {
                newSelectionRange.parent = ranges[ranges.length - 1];
            }
            ranges.push(newSelectionRange);
            
            // Debug logging for position (1, 6)
            if (newRange.start.line === 1 && newRange.start.character === 7 && newRange.end.character === 14) {
                console.log('DEBUG: Method name range ADDED successfully');
            }
        }
    }

    private isRangeLarger(range1: vscode.Range, range2: vscode.Range): boolean {
        // A range is larger if it spans more lines or more characters on the same line
        const lines1 = range1.end.line - range1.start.line;
        const lines2 = range2.end.line - range2.start.line;
        
        if (lines1 > lines2) return true;
        if (lines1 < lines2) return false;
        
        // Same number of lines, compare character spans
        const chars1 = range1.end.character - range1.start.character;
        const chars2 = range2.end.character - range2.start.character;
        
        return chars1 > chars2;
    }

    private findLogicalLineRange(lines: string[], lineIndex: number): { start: number; end: number } | null {
        // Bounds checking
        if (lineIndex < 0 || lineIndex >= lines.length) {
            return null;
        }
        
        // Find consecutive lines that form a logical group
        let start = lineIndex;
        let end = lineIndex;
        
        // Expand upwards to include previous lines that are part of the same logical group
        while (start > 0) {
            if (start - 1 < 0 || start - 1 >= lines.length) {
                break;
            }
            const prevLine = lines[start - 1].trim();
            if (prevLine === '' || prevLine.endsWith(',') || prevLine.endsWith('{') || prevLine.endsWith('}')) {
                start--;
            } else {
                break;
            }
        }
        
        // Expand downwards to include next lines that are part of the same logical group
        while (end < lines.length - 1) {
            if (end + 1 < 0 || end + 1 >= lines.length) {
                break;
            }
            const nextLine = lines[end + 1].trim();
            const currentLine = lines[end].trim();
            if (nextLine === '' || currentLine.endsWith(',') || currentLine.endsWith('{') || nextLine.startsWith('}')) {
                end++;
            } else {
                break;
            }
        }
        
        if (start < end) {
            return { start, end };
        }
        
        return null;
    }

    private findContainingBlock(lines: string[], lineIndex: number): { start: number; end: number } | null {
        // Bounds checking
        if (lineIndex < 0 || lineIndex >= lines.length) {
            return null;
        }
        
        // Find the block containing this line (indicated by braces)
        let start = -1;
        let end = -1;
        
        // Look backwards for opening brace
        for (let i = lineIndex; i >= 0; i--) {
            if (i < 0 || i >= lines.length) {
                continue;
            }
            if (lines[i].includes('{')) {
                start = i;
                break;
            }
        }
        
        // Look forwards for closing brace
        for (let i = lineIndex; i < lines.length; i++) {
            if (i < 0 || i >= lines.length) {
                continue;
            }
            if (lines[i].includes('}')) {
                end = i;
                break;
            }
        }
        
        if (start >= 0 && end >= 0 && start < end) {
            return { start, end };
        }
        
        return null;
    }

    private findContainingTypeDefinition(lines: string[], lineIndex: number): { start: number; end: number } | null {
        // Bounds checking
        if (lineIndex < 0 || lineIndex >= lines.length) {
            return null;
        }
        
        // Find the type definition containing this line
        let typeStart = -1;
        let braceDepth = 0;
        let foundStart = false;

        // First, find the type definition that contains this line
        for (let i = Math.max(0, lineIndex - 20); i <= lineIndex; i++) {
            if (i < 0 || i >= lines.length) {
                continue;
            }
            const line = lines[i].trim();

            if (line.match(/^(struct|union|exception|enum|senum|service)\s+\w+/)) {
                typeStart = i;
                foundStart = true;
            }
        }

        if (typeStart !== -1) {
            // Reset brace depth for finding the closing brace
            braceDepth = 0;
            
            // Find the closing brace starting from the type definition
            for (let i = typeStart; i < lines.length; i++) {
                if (i < 0 || i >= lines.length) {
                    continue;
                }
                const line = lines[i];

                for (let j = 0; j < line.length; j++) {
                    if (line[j] === '{') {
                        braceDepth++;
                    } else if (line[j] === '}') {
                        braceDepth--;
                        if (braceDepth === 0) {
                            return {start: typeStart, end: i};
                        }
                    }
                }
            }
        }

        return null;
    }
}

export function registerSelectionRangeProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftSelectionRangeProvider();
    const disposable = vscode.languages.registerSelectionRangeProvider('thrift', provider);
    context.subscriptions.push(disposable);
}