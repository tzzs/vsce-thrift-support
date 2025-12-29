import { ConstField, EnumField, StructField, ThriftFormattingOptions } from './interfaces';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes';

/**
 * ThriftFormatter：将 Thrift 源码格式化为统一风格。
 */
export class ThriftFormatter {
    private reServiceMethod = /^\s*(oneway\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]*>)?\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)(\s*throws\s*\([^)]*\))?\s*[;,]?$/;

    /**
     * 格式化指定文本内容。
     */
    public format(content: string, options: ThriftFormattingOptions = {
        trailingComma: 'preserve',
        alignTypes: true,
        alignFieldNames: true,
        alignStructDefaults: false,
        alignAnnotations: true,
        alignComments: true,
        alignEnumNames: true,
        alignEnumEquals: true,
        alignEnumValues: true,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve',
        insertSpaces: true,
        tabSize: 4
    }): string {
        const lines = content.split(/\r?\n/);
        const ast = new ThriftParser(content).parse();
        const astIndex = this.buildAstIndex(ast);
        const {
            structStarts,
            structFieldIndex,
            enumStarts,
            enumMemberIndex,
            serviceStarts,
            constStarts,
            constEnds
        } = astIndex;
        const formattedLines: string[] = [];
        let indentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
            ? options.initialContext.indentLevel : 0;
        let inStruct = !!(options.initialContext && options.initialContext.inStruct);
        let inEnum = !!(options.initialContext && options.initialContext.inEnum);
        let inService = !!(options.initialContext && options.initialContext.inService);
        let serviceIndentLevel = (options.initialContext && typeof options.initialContext.indentLevel === 'number')
            ? options.initialContext.indentLevel : 0;
        let structFields: StructField[] = [];
        let enumFields: EnumField[] = [];
        let constFields: ConstField[] = [];
        let inConstBlock = false;
        // Track the indent level where the current const block started, so flushing uses the correct base indent
        let constBlockIndentLevel: number | null = null;

        for (let i = 0; i < lines.length; i++) {
            let originalLine = lines[i];
            let line = originalLine.trim();
            const isConstStart = constStarts.has(i);
            const isStructStart = structStarts.has(i) || this.isStructStartLine(line);
            const isEnumStart = enumStarts.has(i) || this.isEnumStartLine(line);
            const isServiceStart = serviceStarts.has(i) || this.isServiceStartLine(line);

            // Flush accumulated struct fields before non-field separators/comments inside struct
            const hasStructField = structFieldIndex.has(i) || this.isStructFieldText(line);
            if (inStruct && structFields.length > 0 && !hasStructField && !line.startsWith('}')) {
                const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                formattedLines.push(...formattedFields);
                structFields = [];
            }

            // Handle block comments
            if (line.startsWith('/*')) {
                const commentLines: string[] = [originalLine];
                let j = i + 1;
                let closed = line.includes('*/');
                while (!closed && j < lines.length) {
                    commentLines.push(lines[j]);
                    if (lines[j].includes('*/')) {
                        closed = true;
                    }
                    j++;
                }

                // Use service indent if we're inside a service, otherwise use regular indent
                let indentStr: string;
                if (inService) {
                    // Documentation comments inside services should use method-level indent (2 spaces)
                    indentStr = this.getServiceIndent(serviceIndentLevel + 1, options);
                } else {
                    indentStr = this.getIndent(indentLevel, options);
                }

                // Single-line block comment
                if (commentLines.length === 1) {
                    formattedLines.push(indentStr + line);
                    continue;
                }

                const openTrim = commentLines[0].trim();
                const openIsDoc = openTrim.startsWith('/**');
                const openToken = openIsDoc ? '/**' : '/*';
                const openRest = openTrim.slice(openToken.length);
                formattedLines.push(indentStr + openToken + openRest);

                for (let k = 1; k < commentLines.length - 1; k++) {
                    let mid = commentLines[k].trim();
                    if (mid.startsWith('*')) {
                        mid = mid.slice(1);
                    }
                    mid = mid.replace(/^\s*/, '');
                    // For proper alignment, add a space after the indent to align * with the first * in /**
                    // Standard Javadoc style alignment
                    const alignmentSpace = ' ';
                    if (mid.length > 0) {
                        formattedLines.push(indentStr + alignmentSpace + '* ' + mid);
                    } else {
                        formattedLines.push(indentStr + alignmentSpace + '*');
                    }
                }

                // For proper alignment, add a space before */ to align with the first * in /**
                const closingSpace = ' ';
                formattedLines.push(indentStr + closingSpace + '*/');
                i = j - 1;
                continue;
            }

            // Flush const block if needed
            if (inConstBlock && constFields.length > 0 && !isConstStart) {
                const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
                formattedLines.push(...formattedFields);
                constFields = [];
                inConstBlock = false;
                constBlockIndentLevel = null;
            }

            // Skip empty lines and line comments
            if (!line || line.startsWith('//') || line.startsWith('#')) {
                if (inService) {
                    formattedLines.push(this.getServiceIndent(serviceIndentLevel + 1, options) + line);
                } else {
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                }
                continue;
            }

            // Handle const fields (AST indexed)
            if (isConstStart) {
                const endLine = constEnds.get(i) ?? i;
                const constText = lines.slice(i, endLine + 1).join('\n');
                const fieldInfo = this.parseConstFieldText(constText);
                if (fieldInfo) {
                    if (constFields.length === 0) {
                        constBlockIndentLevel = (inStruct || inEnum || inService) ? indentLevel : 0;
                    }
                    constFields.push(fieldInfo);
                    inConstBlock = true;
                }
                i = endLine;
                continue;
            }

            // Typedef normalization
            if (/^\s*typedef\b/.test(line)) {
                const normalized = this.normalizeGenericsInSignature(line);
                formattedLines.push(this.getIndent(indentLevel, options) + normalized);
                continue;
            }

            // Handle struct/union/exception definitions
            if (this.isInlineStructLike(line)) {
                const formattedInline = this.formatInlineStructLike(line, indentLevel, options);
                if (formattedInline) {
                    formattedLines.push(...formattedInline);
                    continue;
                }
            }
            if (isStructStart) {
                if (line.includes('{') && line.includes('}')) {
                    // Single-line struct: parse and format properly
                    const openBraceIndex = line.indexOf('{');
                    const closeBraceIndex = line.lastIndexOf('}');

                    if (openBraceIndex !== -1 && closeBraceIndex !== -1 && openBraceIndex < closeBraceIndex) {
                        // Extract struct header (everything before '{')
                        const structHeader = line.substring(0, openBraceIndex).trim();
                        // Extract content between braces
                        const structContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

                        // Output struct header
                        formattedLines.push(this.getIndent(indentLevel, options) + structHeader + ' {');

                        // Process struct fields if any content exists
                        if (structContent) {
                            const fieldStrings = this.splitTopLevelParts(structContent);
                            const fieldInfos: StructField[] = [];

                            for (const fieldStr of fieldStrings) {
                                const fieldInfo = this.parseStructFieldText(fieldStr.trim());
                                if (fieldInfo) {
                                    fieldInfos.push(fieldInfo);
                                }
                            }

                            // Format all fields together for proper alignment and comma handling
                            if (fieldInfos.length > 0) {
                                const formattedFields = this.formatStructFields(fieldInfos, options, indentLevel + 1);
                                formattedLines.push(...formattedFields);
                            }
                        }

                        // Output closing brace
                        formattedLines.push(this.getIndent(indentLevel, options) + '}');
                        continue;
                    }
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inStruct = true;
                continue;
            }

            // Handle service definitions
            if (this.isInlineService(line)) {
                const formattedInline = this.formatInlineService(line, indentLevel, options);
                if (formattedInline) {
                    formattedLines.push(...formattedInline);
                    continue;
                }
            }
            if (isServiceStart) {
                if (line.includes('{') && line.includes('}')) {
                    // 单行服务：解析并格式化
                    const openBraceIndex = line.indexOf('{');
                    const closeBraceIndex = line.lastIndexOf('}');

                    if (openBraceIndex !== -1 && closeBraceIndex !== -1 && openBraceIndex < closeBraceIndex) {
                        // 提取服务头部（'{'之前的内容）
                        const serviceHeader = line.substring(0, openBraceIndex).trim();
                        // 提取大括号之间的内容
                        const serviceContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

                        // 输出服务头部
                        formattedLines.push(this.getIndent(indentLevel, options) + serviceHeader + ' {');

                        // 处理服务方法
                        if (serviceContent) {
                            const methodStrings = this.splitTopLevelParts(serviceContent);

                            for (const methodStr of methodStrings) {
                                const trimmedMethod = methodStr.trim();
                                if (trimmedMethod) {
                                    // 标准化泛型并格式化方法
                                    const normalizedMethod = this.normalizeGenericsInSignature(trimmedMethod);
                                    formattedLines.push(this.getServiceIndent(indentLevel + 1, options) + normalizedMethod);
                                }
                            }
                        }

                        // 输出结束大括号
                        formattedLines.push(this.getIndent(indentLevel, options) + '}');
                        continue;
                    }
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                // For service, we want methods to be indented 2 spaces, not 4
                // So we don't increment indentLevel here, but track service state
                inService = true;
                serviceIndentLevel = indentLevel;  // Track the service base level
                continue;
            }
            if (inStruct) {
                if (line.startsWith('}')) {
                    if (structFields.length > 0) {
                        const formattedFields = this.formatStructFields(structFields, options, indentLevel);
                        formattedLines.push(...formattedFields);
                        structFields = [];
                    }
                    indentLevel--;
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    inStruct = false;
                    continue;
                }

                if (this.reServiceMethod.test(line)) {
                    const normalized = this.normalizeGenericsInSignature(line);
                    formattedLines.push(this.getIndent(indentLevel, options) + normalized);
                    continue;
                }

                const fieldNode = structFieldIndex.get(i);
                const fieldInfo = fieldNode
                    ? this.buildStructFieldFromAst(line, fieldNode)
                    : this.parseStructFieldText(line);
                if (fieldInfo) {
                    structFields.push(fieldInfo);
                    continue;
                }
            }

            // Handle service content
            if (inService) {
                if (line.startsWith('}')) {
                    inService = false;
                    formattedLines.push(this.getServiceIndent(serviceIndentLevel, options) + line);
                    continue;
                }

                // Handle service method parameters (lines starting with digit like "1: required Type param,")
                if (/^\s*\d+:\s*/.test(line)) {
                    // This is a service method parameter, use 4-space indent (2 levels)
                    // Following Apache Thrift standard where parameters are indented more than methods
                    const paramIndent = this.getServiceIndent(serviceIndentLevel + 2, options);
                    formattedLines.push(paramIndent + line.trim());
                    continue;
                }

                if (this.reServiceMethod.test(line)) {
                    const normalized = this.normalizeGenericsInSignature(line);
                    // Service methods should use 2-space indent from service level
                    const methodIndent = this.getServiceIndent(serviceIndentLevel + 1, options);
                    formattedLines.push(methodIndent + normalized);
                    continue;
                }

                // Handle comments and other content in service
                // Special handling for documentation comments
                if (line.trim().startsWith('/**') || line.trim().startsWith('*') || line.trim().startsWith('*/')) {
                    // Documentation comments should be at the same level as methods (2 spaces)
                    // Trim the line and re-indent to ensure consistent formatting
                    formattedLines.push(this.getServiceIndent(serviceIndentLevel + 1, options) + line.trim());
                } else {
                    // Other content (like regular comments)
                    formattedLines.push(this.getServiceIndent(serviceIndentLevel + 1, options) + line);
                }
                continue;
            }

            if (this.isInlineEnum(line)) {
                const formattedInline = this.formatInlineEnum(line, indentLevel, options);
                if (formattedInline) {
                    formattedLines.push(...formattedInline);
                    continue;
                }
            }
            if (isEnumStart) {
                if (line.includes('{') && line.includes('}')) {
                    // 单行枚举：解析并格式化
                    const openBraceIndex = line.indexOf('{');
                    const closeBraceIndex = line.lastIndexOf('}');

                    if (openBraceIndex !== -1 && closeBraceIndex !== -1 && openBraceIndex < closeBraceIndex) {
                        // 提取枚举头部（'{'之前的内容）
                        const enumHeader = line.substring(0, openBraceIndex).trim();
                        // 提取大括号之间的内容
                        const enumContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

                        // 输出枚举头部
                        formattedLines.push(this.getIndent(indentLevel, options) + enumHeader + ' {');

                        // 处理枚举字段
                        if (enumContent) {
                            const fieldStrings = this.splitTopLevelParts(enumContent);
                            const enumFieldInfos: EnumField[] = [];

                            for (const fieldStr of fieldStrings) {
                                const fieldInfo = this.parseEnumFieldText(fieldStr.trim());
                                if (fieldInfo) {
                                    enumFieldInfos.push(fieldInfo);
                                }
                            }

                            // 一起格式化所有字段以获得正确对齐
                            if (enumFieldInfos.length > 0) {
                                const formattedFields = this.formatEnumFields(enumFieldInfos, options, indentLevel + 1);
                                formattedLines.push(...formattedFields);
                            }
                        }

                        // 输出结束大括号
                        formattedLines.push(this.getIndent(indentLevel, options) + '}');
                        continue;
                    }
                }
                formattedLines.push(this.getIndent(indentLevel, options) + line);
                indentLevel++;
                inEnum = true;
                continue;
            }
            if (inEnum) {
                if (line.startsWith('}')) {
                    if (enumFields.length > 0) {
                        const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
                        formattedLines.push(...formattedFields);
                        enumFields = [];
                    }
                    indentLevel--;
                    formattedLines.push(this.getIndent(indentLevel, options) + line);
                    inEnum = false;
                    continue;
                }

                // Flush accumulated enum fields before non-field separators/comments inside enum
                const hasEnumField = enumMemberIndex.has(i) || this.isEnumFieldText(line);
                if (enumFields.length > 0 && !hasEnumField) {
                    const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
                    formattedLines.push(...formattedFields);
                    enumFields = [];
                }

                const enumNode = enumMemberIndex.get(i);
                const fieldInfo = enumNode
                    ? this.buildEnumFieldFromAst(line, enumNode)
                    : this.parseEnumFieldText(line);
                if (fieldInfo) {
                    enumFields.push(fieldInfo);
                    continue;
                }
            }

            if (line === '{') {
                const level = Math.max(indentLevel - 1, 0);
                formattedLines.push(this.getIndent(level, options) + line);
                continue;
            }

            formattedLines.push(this.getIndent(indentLevel, options) + line);
        }

        if (constFields.length > 0) {
            const formattedFields = this.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
            formattedLines.push(...formattedFields);
        }
        if (structFields.length > 0) {
            const formattedFields = this.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }
        if (enumFields.length > 0) {
            const formattedFields = this.formatEnumFields(enumFields, options, indentLevel);
            formattedLines.push(...formattedFields);
        }

        const cleaned = formattedLines.map(l => l.replace(/\s+$/g, ''));
        return cleaned.join('\n');
    }

    private buildAstIndex(ast: nodes.ThriftDocument): {
        structStarts: Map<number, nodes.Struct>;
        structFieldIndex: Map<number, nodes.Field>;
        enumStarts: Map<number, nodes.Enum>;
        enumMemberIndex: Map<number, nodes.EnumMember>;
        serviceStarts: Map<number, nodes.Service>;
        serviceFunctionIndex: Map<number, nodes.ThriftFunction>;
        constStarts: Map<number, nodes.Const>;
        constEnds: Map<number, number>;
    } {
        const structStarts = new Map<number, nodes.Struct>();
        const structFieldIndex = new Map<number, nodes.Field>();
        const enumStarts = new Map<number, nodes.Enum>();
        const enumMemberIndex = new Map<number, nodes.EnumMember>();
        const serviceStarts = new Map<number, nodes.Service>();
        const serviceFunctionIndex = new Map<number, nodes.ThriftFunction>();
        const constStarts = new Map<number, nodes.Const>();
        const constEnds = new Map<number, number>();

        const visit = (node: nodes.ThriftNode) => {
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                case nodes.ThriftNodeType.Union:
                case nodes.ThriftNodeType.Exception: {
                    const structNode = node as nodes.Struct;
                    structStarts.set(structNode.range.start.line, structNode);
                    structNode.fields.forEach(field => {
                        structFieldIndex.set(field.range.start.line, field);
                    });
                    break;
                }
                case nodes.ThriftNodeType.Enum: {
                    const enumNode = node as nodes.Enum;
                    enumStarts.set(enumNode.range.start.line, enumNode);
                    enumNode.members.forEach(member => {
                        enumMemberIndex.set(member.range.start.line, member);
                    });
                    break;
                }
                case nodes.ThriftNodeType.Service: {
                    const serviceNode = node as nodes.Service;
                    serviceStarts.set(serviceNode.range.start.line, serviceNode);
                    serviceNode.functions.forEach(fn => {
                        serviceFunctionIndex.set(fn.range.start.line, fn);
                    });
                    break;
                }
                case nodes.ThriftNodeType.Const: {
                    const constNode = node as nodes.Const;
                    constStarts.set(constNode.range.start.line, constNode);
                    constEnds.set(constNode.range.start.line, constNode.range.end.line);
                    break;
                }
                default:
                    break;
            }
        };

        ast.body.forEach(visit);

        return {
            structStarts,
            structFieldIndex,
            enumStarts,
            enumMemberIndex,
            serviceStarts,
            serviceFunctionIndex,
            constStarts,
            constEnds
        };
    }

    private splitLineComment(line: string): { code: string; comment: string } {
        let inS = false;
        let inD = false;
        let escaped = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const next = i + 1 < line.length ? line[i + 1] : '';
            if (inS) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (!escaped && ch === '\'') {
                    inS = false;
                }
                escaped = false;
                continue;
            }
            if (inD) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (!escaped && ch === '"') {
                    inD = false;
                }
                escaped = false;
                continue;
            }
            if (ch === '\'') {
                inS = true;
                continue;
            }
            if (ch === '"') {
                inD = true;
                continue;
            }
            if (ch === '/' && next === '/') {
                return { code: line.slice(0, i), comment: line.slice(i).trim() };
            }
            if (ch === '#') {
                return { code: line.slice(0, i), comment: line.slice(i).trim() };
            }
        }
        return { code: line, comment: '' };
    }

    private splitTrailingAnnotation(source: string): { base: string; annotation: string } {
        const trimmed = source.trimEnd();
        if (!trimmed.endsWith(')')) {
            return { base: source.trim(), annotation: '' };
        }
        let inS = false;
        let inD = false;
        let escaped = false;
        const stack: number[] = [];
        let lastPair: { start: number; end: number } | null = null;

        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (inS) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (!escaped && ch === '\'') {
                    inS = false;
                }
                escaped = false;
                continue;
            }
            if (inD) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (!escaped && ch === '"') {
                    inD = false;
                }
                escaped = false;
                continue;
            }
            if (ch === '\'') {
                inS = true;
                continue;
            }
            if (ch === '"') {
                inD = true;
                continue;
            }
            if (ch === '(') {
                stack.push(i);
                continue;
            }
            if (ch === ')' && stack.length > 0) {
                const start = stack.pop() as number;
                if (stack.length === 0) {
                    lastPair = { start, end: i };
                }
            }
        }

        if (!lastPair) {
            return { base: source.trim(), annotation: '' };
        }
        const tail = trimmed.slice(lastPair.end + 1).trim();
        if (tail) {
            return { base: source.trim(), annotation: '' };
        }
        return {
            base: trimmed.slice(0, lastPair.start).trimEnd(),
            annotation: trimmed.slice(lastPair.start, lastPair.end + 1)
        };
    }

    private normalizeType(type: string): string {
        return type
            .replace(/\s+</g, '<')
            .replace(/<\s+/g, '<')
            .replace(/\s+>/g, '>')
            .replace(/>\s*/g, '>')
            .replace(/\s*,\s*/g, ',');
    }

    private buildStructFieldFromAst(line: string, field: nodes.Field): StructField | null {
        const { code, comment } = this.splitLineComment(line);
        let remainder = code.trim();
        let trailing = '';
        const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
        if (suffixMatch) {
            remainder = suffixMatch[1].trim();
            trailing = suffixMatch[2].trim();
        }
        let annotation = '';
        const annSplit = this.splitTrailingAnnotation(remainder);
        if (annSplit.annotation) {
            remainder = annSplit.base;
            annotation = annSplit.annotation;
        }

        const qualifier = field.requiredness || '';
        const type = this.normalizeType(field.fieldType || '');
        const name = field.name || '';
        let suffix = '';
        if (field.defaultValue) {
            suffix = ` = ${field.defaultValue}`;
        }
        if (trailing) {
            suffix += trailing;
        }

        if (!name || !type) {
            return null;
        }

        return {
            line: line.trim(),
            id: String(field.id),
            qualifier,
            type,
            name,
            suffix,
            comment,
            annotation
        };
    }

    private parseStructFieldText(text: string): StructField | null {
        if (!text) {
            return null;
        }
        const { code, comment } = this.splitLineComment(text);
        let remainder = code.trim();

        const prefixMatch = remainder.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(.*)$/);
        if (!prefixMatch) {
            return null;
        }
        const prefix = prefixMatch[1];
        remainder = prefixMatch[2];

        const idQualMatch = prefix.match(/^\s*(\d+):\s*((?:required|optional)?)\s*/);
        const id = idQualMatch ? idQualMatch[1] : '';
        const qualifier = idQualMatch ? idQualMatch[2] : '';

        let trailing = '';
        const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
        if (suffixMatch) {
            remainder = suffixMatch[1].trim();
            trailing = suffixMatch[2].trim();
        }

        let annotation = '';
        const annSplit = this.splitTrailingAnnotation(remainder);
        if (annSplit.annotation) {
            remainder = annSplit.base;
            annotation = annSplit.annotation;
        }

        const fieldMatch = remainder.match(/^(.+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*(.+))?$/);
        if (!fieldMatch) {
            return null;
        }

        let type = this.normalizeType(fieldMatch[1].trim());
        const name = fieldMatch[2];
        const defaultValue = fieldMatch[3];

        let suffix = '';
        if (defaultValue) {
            suffix = ` = ${defaultValue.trim()}`;
        }
        if (trailing) {
            suffix += trailing;
        }

        return {
            line: text.trim(),
            id,
            qualifier,
            type,
            name,
            suffix,
            comment,
            annotation
        };
    }

    private isStructFieldText(line: string): boolean {
        const t = line.trimStart();
        const c = t.charCodeAt(0);
        if (!(c >= 48 && c <= 57)) {
            return false;
        }
        return /^\s*\d+:\s*(?:required|optional)?\s*.+$/.test(line);
    }

    private buildEnumFieldFromAst(line: string, member: nodes.EnumMember): EnumField | null {
        const { code, comment } = this.splitLineComment(line);
        let remainder = code.trim();
        let trailing = '';
        const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
        if (suffixMatch) {
            remainder = suffixMatch[1].trim();
            trailing = suffixMatch[2].trim();
        }

        let annotation = '';
        const annSplit = this.splitTrailingAnnotation(remainder);
        if (annSplit.annotation) {
            remainder = annSplit.base;
            annotation = annSplit.annotation;
        }

        let value = member.initializer;
        if (!value) {
            const match = remainder.match(/=\s*([^,;]+)\s*$/);
            if (match) {
                value = match[1].trim();
            }
        }
        if (!member.name) {
            return null;
        }

        return {
            line: line.trim(),
            name: member.name,
            value: value || '',
            suffix: trailing,
            comment,
            annotation
        };
    }

    private parseEnumFieldText(text: string): EnumField | null {
        if (!text) {
            return null;
        }
        const { code, comment } = this.splitLineComment(text);
        let remainder = code.trim();

        let trailing = '';
        const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
        if (suffixMatch) {
            remainder = suffixMatch[1].trim();
            trailing = suffixMatch[2].trim();
        }

        let annotation = '';
        const annSplit = this.splitTrailingAnnotation(remainder);
        if (annSplit.annotation) {
            remainder = annSplit.base;
            annotation = annSplit.annotation;
        }

        const fieldMatch = remainder.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(.+))?$/);
        if (!fieldMatch) {
            return null;
        }

        return {
            line: text.trim(),
            name: fieldMatch[1],
            value: (fieldMatch[2] || '').trim(),
            suffix: trailing,
            comment,
            annotation
        };
    }

    private isEnumFieldText(line: string): boolean {
        const t = line.trimStart();
        const cc = t.charCodeAt(0);
        const isLetter = (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95;
        if (!isLetter) {
            return false;
        }
        return /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[-+]?(?:\d+|0x[0-9a-fA-F]+)/i.test(line);
    }

    private parseConstFieldText(source: string): ConstField | null {
        if (!source) {
            return null;
        }
        const lines = source.split('\n');
        const header = (lines[0] || '').trim();
        const m = header.match(/^const\s+([\w<>,\s]+?)\s+(\w+)\s*=\s*(.*)$/);
        if (!m) {
            return null;
        }
        let type = this.normalizeType(m[1].trim());
        const name = m[2].trim();
        let firstValuePart = (m[3] || '').trim();

        let comment = '';
        const commentIdx = firstValuePart.indexOf('//');
        if (commentIdx >= 0) {
            comment = firstValuePart.slice(commentIdx).trim();
            firstValuePart = firstValuePart.slice(0, commentIdx).trim();
        }

        let value = firstValuePart;
        if (lines.length > 1) {
            const rest = lines.slice(1).map(l => l.trim()).join('\n');
            value = (value ? value + '\n' : '') + rest;
        }

        return {
            line: header,
            type,
            name,
            value,
            comment
        };
    }

    private isInlineStructLike(line: string): boolean {
        return /^(struct|union|exception)\b/.test(line) && line.includes('{') && line.includes('}');
    }

    private isInlineEnum(line: string): boolean {
        return /^(enum|senum)\b/.test(line) && line.includes('{') && line.includes('}');
    }

    private isInlineService(line: string): boolean {
        return /^service\b/.test(line) && line.includes('{') && line.includes('}');
    }

    private isStructStartLine(line: string): boolean {
        return /^(struct|union|exception)\b/.test(line) && line.includes('{') && !line.includes('}');
    }

    private isEnumStartLine(line: string): boolean {
        return /^(enum|senum)\b/.test(line) && line.includes('{') && !line.includes('}');
    }

    private isServiceStartLine(line: string): boolean {
        return /^service\b/.test(line) && line.includes('{') && !line.includes('}');
    }

    private formatInlineStructLike(line: string, indentLevel: number, options: ThriftFormattingOptions): string[] | null {
        const openBraceIndex = line.indexOf('{');
        const closeBraceIndex = line.lastIndexOf('}');
        if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
            return null;
        }
        const structHeader = line.substring(0, openBraceIndex).trim();
        const structContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

        const out: string[] = [];
        out.push(this.getIndent(indentLevel, options) + structHeader + ' {');
        if (structContent) {
            const fieldStrings = this.splitTopLevelParts(structContent);
            const fieldInfos: StructField[] = [];
            for (const fieldStr of fieldStrings) {
                const fieldInfo = this.parseStructFieldText(fieldStr.trim());
                if (fieldInfo) {
                    fieldInfos.push(fieldInfo);
                }
            }
            if (fieldInfos.length > 0) {
                const formattedFields = this.formatStructFields(fieldInfos, options, indentLevel + 1);
                out.push(...formattedFields);
            }
        }
        out.push(this.getIndent(indentLevel, options) + '}');
        return out;
    }

    private formatInlineEnum(line: string, indentLevel: number, options: ThriftFormattingOptions): string[] | null {
        const openBraceIndex = line.indexOf('{');
        const closeBraceIndex = line.lastIndexOf('}');
        if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
            return null;
        }
        const enumHeader = line.substring(0, openBraceIndex).trim();
        const enumContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

        const out: string[] = [];
        out.push(this.getIndent(indentLevel, options) + enumHeader + ' {');
        if (enumContent) {
            const fieldStrings = this.splitTopLevelParts(enumContent);
            const enumFieldInfos: EnumField[] = [];
            for (const fieldStr of fieldStrings) {
                const fieldInfo = this.parseEnumFieldText(fieldStr.trim());
                if (fieldInfo) {
                    enumFieldInfos.push(fieldInfo);
                }
            }
            if (enumFieldInfos.length > 0) {
                const formattedFields = this.formatEnumFields(enumFieldInfos, options, indentLevel + 1);
                out.push(...formattedFields);
            }
        }
        out.push(this.getIndent(indentLevel, options) + '}');
        return out;
    }

    private formatInlineService(line: string, indentLevel: number, options: ThriftFormattingOptions): string[] | null {
        const openBraceIndex = line.indexOf('{');
        const closeBraceIndex = line.lastIndexOf('}');
        if (openBraceIndex === -1 || closeBraceIndex === -1 || openBraceIndex >= closeBraceIndex) {
            return null;
        }
        const serviceHeader = line.substring(0, openBraceIndex).trim();
        const serviceContent = line.substring(openBraceIndex + 1, closeBraceIndex).trim();

        const out: string[] = [];
        out.push(this.getIndent(indentLevel, options) + serviceHeader + ' {');
        if (serviceContent) {
            const methodStrings = this.splitTopLevelParts(serviceContent);
            for (const methodStr of methodStrings) {
                const trimmedMethod = methodStr.trim();
                if (trimmedMethod) {
                    const normalizedMethod = this.normalizeGenericsInSignature(trimmedMethod);
                    out.push(this.getServiceIndent(indentLevel + 1, options) + normalizedMethod);
                }
            }
        }
        out.push(this.getIndent(indentLevel, options) + '}');
        return out;
    }

    public getIndent(level: number, options: ThriftFormattingOptions): string {
        const indentSize = options.indentSize || 2;  // Default to 2 spaces for standard formatting
        if (options.insertSpaces) {
            return ' '.repeat(level * indentSize);
        } else {
            return '\t'.repeat(level);
        }
    }

    public getServiceIndent(level: number, options: ThriftFormattingOptions): string {
        // Use standard indentation logic based on options
        return this.getIndent(level, options);
    }

    public formatThriftCode(text: string, options: ThriftFormattingOptions): string {
        // Delegate to the existing format method
        return this.format(text, options);
    }

    private formatStructFields(
        fields: StructField[],
        options: ThriftFormattingOptions,
        indentLevel: number
    ): string[] {
        const sortedFields = fields;

        const needsAlignment = options.alignTypes || options.alignFieldNames || options.alignComments || options.alignAnnotations;

        if (!needsAlignment && options.trailingComma === 'preserve') {
            return sortedFields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        let maxFieldIdWidth = 0;
        let maxQualifierWidth = 0;
        let maxTypeWidth = 0;
        let maxNameWidth = 0;
        let maxAnnotationWidth = 0;
        let maxContentWidth = 0;

        const parsedFields = sortedFields.map(field => {
            maxFieldIdWidth = Math.max(maxFieldIdWidth, field.id.length);
            maxQualifierWidth = Math.max(maxQualifierWidth, field.qualifier.length);
            maxTypeWidth = Math.max(maxTypeWidth, field.type.length);
            maxNameWidth = Math.max(maxNameWidth, field.name.length);
            if (options.alignAnnotations && field.annotation) {
                maxAnnotationWidth = Math.max(maxAnnotationWidth, field.annotation.length);
            }
            return field;
        });

        parsedFields.forEach(field => {
            let contentWidth = 0;
            contentWidth += maxFieldIdWidth + 2; // +2 for ": "

            if (options.alignTypes) {
                contentWidth += maxQualifierWidth;
                if (maxQualifierWidth > 0) {
                    contentWidth += 1;
                }
            } else {
                contentWidth += field.qualifier.length;
                if (field.qualifier.length > 0) {
                    contentWidth += 1;
                }
            }

            if (options.alignTypes) {
                contentWidth += maxTypeWidth;
            } else {
                contentWidth += field.type.length;
            }
            contentWidth += 1; // space after type

            if (options.alignFieldNames) {
                if (field.suffix) {
                    const hasDefaultValue = field.suffix.includes('=');
                    if (hasDefaultValue && options.alignStructDefaults) {
                        const normalized = field.suffix.replace(/\s*=\s*/, ' = ');
                        contentWidth += maxNameWidth + normalized.length;
                    } else {
                        contentWidth += field.name.length + field.suffix.length;
                    }
                } else {
                    contentWidth += field.name.length;
                }
            } else {
                contentWidth += field.name.length;
                if (field.suffix) {
                    contentWidth += field.suffix.length;
                }
            }

            if (options.alignAnnotations && field.annotation) {
                contentWidth += 1;
                contentWidth += maxAnnotationWidth;
            } else if (field.annotation) {
                contentWidth += 1 + field.annotation.length;
            }

            if (options.trailingComma === 'preserve') {
                if ((field.suffix && field.suffix.includes(','))) {
                    contentWidth += 1;
                }
            }

            maxContentWidth = Math.max(maxContentWidth, contentWidth);
        });

        const targetAnnoStart = (() => {
            if (!options.alignAnnotations) {
                return 0;
            }
            let max = 0;
            parsedFields.forEach(f => {
                if (!f || !f.annotation) {
                    return;
                }
                let w = 0;
                w += maxFieldIdWidth + 2;
                if (options.alignTypes) {
                    w += maxQualifierWidth;
                    if (maxQualifierWidth > 0) {
                        w += 1;
                    }
                } else {
                    w += f.qualifier.length;
                    if (f.qualifier.length > 0) {
                        w += 1;
                    }
                }
                w += (options.alignTypes ? maxTypeWidth : f.type.length);
                w += 1;
                if (options.alignFieldNames) {
                    if (f.suffix) {
                        let s = f.suffix;
                        if (/\,\s*$/.test(s)) {
                            s = s.replace(/,\s*$/, '');
                        }
                        const hasDefault = s.includes('=');
                        if (hasDefault) {
                            s = s.replace(/\s*=\s*/, ' = ');
                        }
                        if (hasDefault && options.alignStructDefaults) {
                            w += maxNameWidth + s.length;
                        } else {
                            w += f.name.length + s.length;
                        }
                    } else {
                        w += f.name.length;
                    }
                } else {
                    w += f.name.length;
                    if (f.suffix) {
                        let s = f.suffix;
                        if (/\,\s*$/.test(s)) {
                            s = s.replace(/,\s*$/, '');
                        }
                        if (s.includes('=')) {
                            s = s.replace(/\s*=\s*/, ' = ');
                        }
                        w += s.length;
                    }
                }
                if (w > max) {
                    max = w;
                }
            });
            return max;
        })();

        const commentCount = parsedFields.reduce((acc, f) => acc + ((f && f.comment) ? 1 : 0), 0);

        return parsedFields.map(field => {
            let formattedLine = this.getIndent(indentLevel, options);

            const fieldIdWithColon = field.id + ':';
            formattedLine += fieldIdWithColon.padEnd(maxFieldIdWidth + 1) + ' ';

            if (options.alignTypes) {
                formattedLine += field.qualifier.padEnd(maxQualifierWidth);
                if (maxQualifierWidth > 0) {
                    formattedLine += ' ';
                }
            } else {
                formattedLine += field.qualifier;
                if (field.qualifier.length > 0) {
                    formattedLine += ' ';
                }
            }

            if (options.alignTypes) {
                formattedLine += field.type.padEnd(maxTypeWidth);
            } else {
                formattedLine += field.type;
            }

            formattedLine += ' ';

            let cleanSuffix = field.suffix || '';
            let hasComma = cleanSuffix ? /,\s*$/.test(cleanSuffix) : false;
            const hasSemicolon = cleanSuffix ? /;/.test(cleanSuffix) : false;
            let appendedComma = false;

            if (hasComma) {
                cleanSuffix = cleanSuffix.replace(/,\s*$/, '');
            }

            if (cleanSuffix && cleanSuffix.includes('=')) {
                cleanSuffix = cleanSuffix.replace(/\s*=\s*/, ' = ');
            }

            if (options.trailingComma === 'add' && !hasComma && !hasSemicolon) {
                hasComma = true;
            } else if (options.trailingComma === 'remove' && hasComma && !hasSemicolon) {
                hasComma = false;
            }

            if (options.alignFieldNames) {
                if (cleanSuffix) {
                    const hasDefaultValue = cleanSuffix.includes('=');

                    if (hasDefaultValue) {
                        if (options.alignStructDefaults) {
                            formattedLine += field.name.padEnd(maxNameWidth);
                        } else {
                            formattedLine += field.name;
                        }
                    } else {
                        formattedLine += field.name;
                    }
                    formattedLine += cleanSuffix;
                } else {
                    formattedLine += field.name;
                }
                if (field.annotation) {
                    if (options.alignAnnotations) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const spaces = targetAnnoStart - currentWidth + 1;
                        formattedLine += ' '.repeat(spaces) + field.annotation;
                        if (hasComma && options.trailingComma !== 'add') {
                            formattedLine += ',';
                            appendedComma = true;
                        }
                    } else {
                        formattedLine += ' ' + field.annotation;
                        if (hasComma && options.trailingComma !== 'add') {
                            formattedLine += ',';
                            appendedComma = true;
                        }
                    }
                }
                if (hasComma && options.trailingComma !== 'add' && !appendedComma) {
                    formattedLine += ',';
                    appendedComma = true;
                }
                if (field.comment) {
                    if (options.alignComments) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const diff = maxContentWidth - currentWidth;
                        const basePad = Math.max(1, diff + 1);
                        const padSpaces = commentCount > 1 ? basePad : 1;
                        formattedLine += ' '.repeat(padSpaces) + field.comment;
                    } else {
                        formattedLine += ' ' + field.comment;
                    }
                }
                if (hasComma && options.trailingComma === 'add') {
                    formattedLine += ',';
                }
            } else {
                formattedLine += field.name;
                if (cleanSuffix) {
                    formattedLine += cleanSuffix;
                }
                if (field.annotation) {
                    if (options.alignAnnotations) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const spaces = targetAnnoStart - currentWidth + 1;
                        formattedLine += ' '.repeat(spaces) + field.annotation;
                        if (hasComma && options.trailingComma !== 'add') {
                            formattedLine += ',';
                            appendedComma = true;
                        }
                    } else {
                        formattedLine += ' ' + field.annotation;
                    }
                }
                if (hasComma && options.trailingComma !== 'add' && !appendedComma) {
                    formattedLine += ',';
                    appendedComma = true;
                }
                if (field.comment) {
                    if (options.alignComments) {
                        const currentWidth = formattedLine.length - this.getIndent(indentLevel, options).length;
                        const diff = maxContentWidth - currentWidth;
                        const basePad = Math.max(1, diff + 1);
                        const padSpaces = commentCount > 1 ? basePad : 1;
                        formattedLine += ' '.repeat(padSpaces) + field.comment;
                    } else {
                        formattedLine += ' ' + field.comment;
                    }
                }
                if (hasComma && options.trailingComma === 'add') {
                    formattedLine += ',';
                }
            }

            return formattedLine;
        });
    }

    private formatEnumFields(
        fields: EnumField[],
        options: ThriftFormattingOptions,
        indentLevel: number
    ): string[] {
        const needsAlignment = options.alignEnumNames || options.alignEnumEquals || options.alignEnumValues || options.alignComments || options.trailingComma !== 'preserve';
        if (!needsAlignment) {
            return fields.map(f => this.getIndent(indentLevel, options) + f.line);
        }

        const indent = this.getIndent(indentLevel, options);

        const maxNameWidth = Math.max(...fields.map(f => f.name.length), 0);
        let maxAnnotationWidth = 0;
        if (options.alignAnnotations) {
            fields.forEach(f => {
                if (f.annotation) {
                    maxAnnotationWidth = Math.max(maxAnnotationWidth, f.annotation.length);
                }
            });
        }

        let maxContentWidth = 0;
        let maxAnnoStart = 0;
        const interim: Array<{ base: string; comment: string; hasComma: boolean; hasSemicolon: boolean; annotation: string }> = [];

        for (const f of fields) {
            let hasComma = f.suffix ? /,/.test(f.suffix) : false;
            const hasSemicolon = f.suffix ? /;/.test(f.suffix) : false;

            if (!hasSemicolon) {
                if (options.trailingComma === 'add') {
                    hasComma = true;
                } else if (options.trailingComma === 'remove') {
                    hasComma = false;
                }
            }

            // Handle name/equals alignment
            let base = indent;
            if (options.alignEnumEquals) {
                base += f.name.padEnd(maxNameWidth) + ' = ';
            } else {
                const namePart = options.alignEnumNames ? f.name.padEnd(maxNameWidth) : f.name;
                base += namePart + ' = ';
            }

            const valueStr = '' + f.value;
            base += valueStr;

            if (!hasSemicolon && options.trailingComma !== 'add' && hasComma) {
                base += ',';
            }

            const baseWidth = base.length - indent.length;
            if (options.alignAnnotations && f.annotation) {
                maxAnnoStart = Math.max(maxAnnoStart, baseWidth);
            }

            interim.push({
                base,
                comment: f.comment,
                hasComma,
                hasSemicolon,
                annotation: f.annotation || ''
            });
        }

        if (options.alignAnnotations) {
            interim.forEach(({ base, annotation }) => {
                let line = base;
                if (annotation) {
                    const currentWidth = base.length - indent.length;
                    const spaces = maxAnnoStart - currentWidth + 1;
                    line = base + ' '.repeat(Math.max(1, spaces)) + annotation.padEnd(maxAnnotationWidth);
                }
                maxContentWidth = Math.max(maxContentWidth, line.length - indent.length);
            });
        } else {
            interim.forEach(({ base, annotation }) => {
                let line = base;
                if (annotation) {
                    line = base + ' ' + annotation;
                }
                maxContentWidth = Math.max(maxContentWidth, line.length - indent.length);
            });
        }

        return interim.map(({ base, comment, hasComma, hasSemicolon, annotation }) => {
            let line = base;
            if (annotation) {
                if (options.alignAnnotations) {
                    const currentWidth = base.length - indent.length;
                    const spaces = maxAnnoStart - currentWidth + 1;
                    line = base + ' '.repeat(Math.max(1, spaces)) + annotation.padEnd(maxAnnotationWidth);
                } else {
                    line = base + ' ' + annotation;
                }
            }
            if (comment) {
                if (options.alignComments) {
                    const currentWidth = line.length - indent.length;
                    const pad = Math.max(1, maxContentWidth - currentWidth + 1);
                    line = line + ' '.repeat(pad) + comment;
                } else {
                    line = line + ' ' + comment;
                }
            }
            if (hasSemicolon) {
                line += ';';
            }
            if (!hasSemicolon && hasComma && options.trailingComma === 'add') {
                line += ',';
            }
            return line;
        });
    }

    private formatConstFields(
        fields: ConstField[],
        options: ThriftFormattingOptions,
        indentLevel: number
    ): string[] {
        if (fields.length === 0) {
            return [];
        }

        const collectionStyle = options.collectionStyle || 'preserve';
        const maxLineLength = options.maxLineLength || 100;

        const indent = this.getIndent(indentLevel, options);
        const valueIndent = this.getIndent(indentLevel + 1, options);
        const alignComments = options.alignComments !== false;

        // Expand inline collections
        const adjFields = fields.map((f) => {
            let value = f.value;
            const isInlineCollection = !value.includes('\n') && ((/^\[.*\]$/.test(value)) || (/^\{.*\}$/.test(value)));

            let shouldExpand = false;
            if (isInlineCollection) {
                if (collectionStyle === 'multiline') {
                    shouldExpand = true;
                } else if (collectionStyle === 'auto') {
                    const inlineLine = `${indent}const ${f.type} ${f.name} = ${value}${f.comment ? ' ' + f.comment : ''}`;
                    if (inlineLine.length > maxLineLength) {
                        shouldExpand = true;
                    }
                }
            }

            if (shouldExpand) {
                const open = value[0];
                const close = value[value.length - 1];
                const inner = value.substring(1, value.length - 1).trim();

                const items: string[] = [];
                let current = '';
                let depth = 0;
                let inString = false;
                let stringChar = '';
                for (let i = 0; i < inner.length; i++) {
                    const ch = inner[i];
                    const prev = i > 0 ? inner[i - 1] : '';
                    if (inString) {
                        current += ch;
                        if (ch === stringChar && prev !== '\\') {
                            inString = false;
                        }
                        continue;
                    }
                    if (ch === '"' || ch === "'") {
                        inString = true;
                        stringChar = ch;
                        current += ch;
                        continue;
                    }
                    if (ch === '[' || ch === '{' || ch === '(') {
                        depth++;
                        current += ch;
                        continue;
                    }
                    if (ch === ']' || ch === '}' || ch === ')') {
                        depth--;
                        current += ch;
                        continue;
                    }
                    if (ch === ',' && depth === 0) {
                        if (current.trim()) {
                            items.push(current.trim());
                        }
                        current = '';
                    } else {
                        current += ch;
                    }
                }
                if (current.trim()) {
                    items.push(current.trim());
                }

                const lines: string[] = [open];
                for (let idx = 0; idx < items.length; idx++) {
                    const comma = idx < items.length - 1 ? ',' : '';
                    lines.push(items[idx] + comma);
                }
                lines.push(close);
                value = lines.join('\n');
            }

            return { ...f, value };
        });

        const maxTypeWidth = Math.max(...adjFields.map(f => f.type.length));
        const maxNameWidth = Math.max(...adjFields.map(f => f.name.length));

        let maxFirstLineBaseLen = 0;
        for (const f of adjFields) {
            if (!f.comment) {
                continue;
            }
            const firstLineValue = f.value.includes('\n') ? f.value.split('\n')[0] : f.value;
            const base = `const ${f.type.padEnd(maxTypeWidth)} ${f.name.padEnd(maxNameWidth)} = ${firstLineValue}`;
            if (base.length > maxFirstLineBaseLen) {
                maxFirstLineBaseLen = base.length;
            }
        }

        return adjFields.map(field => {
            const paddedType = field.type.padEnd(maxTypeWidth);
            const paddedName = field.name.padEnd(maxNameWidth);

            if (field.value.includes('\n')) {
                const lines = field.value.split('\n');
                const firstLine = lines[0];
                const outLines: string[] = [];

                let first = `${indent}const ${paddedType} ${paddedName} = ${firstLine}`;
                if (field.comment) {
                    if (alignComments) {
                        const currentLen = first.length - indent.length;
                        const pad = Math.max(1, maxFirstLineBaseLen - currentLen + 1);
                        first = first + ' '.repeat(pad) + field.comment;
                    } else {
                        first += ` ${field.comment}`;
                    }
                }
                outLines.push(first);

                for (let i = 1; i < lines.length; i++) {
                    const raw = lines[i];
                    const line = raw.trim();
                    if (!line) {
                        outLines.push('');
                        continue;
                    }

                    if (line === '}' || line === ']') {
                        outLines.push(indent + line);
                        continue;
                    }

                    if (line.startsWith('//')) {
                        let idx = outLines.length - 1;
                        while (idx >= 0 && outLines[idx] === '') {
                            idx--;
                        }
                        if (idx >= 0) {
                            outLines[idx] += ` ${line}`;
                        } else {
                            outLines.push(indent + line);
                        }
                        continue;
                    }

                    outLines.push(valueIndent + line);
                }

                if (alignComments) {
                    const indices: number[] = [];
                    let maxContentLen = 0;
                    for (let idx = 1; idx < outLines.length; idx++) {
                        const l = outLines[idx];
                        const trimmed = l.trim();
                        if (!trimmed || trimmed === '}' || trimmed === ']') {
                            continue;
                        }
                        const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                        if (m) {
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/, '');
                            const len = leading.length + content.length;
                            if (len > maxContentLen) {
                                maxContentLen = len;
                            }
                            indices.push(idx);
                        }
                    }
                    if (indices.length > 0) {
                        for (const idx of indices) {
                            const l = outLines[idx];
                            const m = l.match(/^(\s*)(.*?)(\s*)(\/\/.*)$/);
                            if (!m) {
                                continue;
                            }
                            const leading = m[1] || '';
                            const content = (m[2] || '').replace(/\s+$/, '');
                            const comment = (m[4] || '').replace(/^\s+/, '');
                            const currentLen = leading.length + content.length;
                            const pad = Math.max(1, maxContentLen - currentLen + 1);
                            outLines[idx] = leading + content + ' '.repeat(pad) + comment;
                        }
                    }
                }

                return outLines.join('\n');
            } else {
                let base = `${indent}const ${paddedType} ${paddedName} = ${field.value}`;
                if (field.comment) {
                    if (alignComments) {
                        const currentLen = base.length - indent.length;
                        const pad = Math.max(1, maxFirstLineBaseLen - currentLen + 1);
                        base = base + ' '.repeat(pad) + field.comment;
                    } else {
                        base += ` ${field.comment}`;
                    }
                }
                return base;
            }
        });
    }

    // Split a single-line struct/enum/service body by top-level separators (; or ,), ignoring nested generics/collections and strings.
    private splitTopLevelParts(content: string): string[] {
        const parts: string[] = [];
        let buf = '';
        let depthAngle = 0, depthParen = 0, depthBrace = 0, depthBracket = 0;
        let inS = false, inD = false, escaped = false;

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            const next = i + 1 < content.length ? content[i + 1] : '';

            if (escaped) {
                buf += ch;
                escaped = false;
                continue;
            }
            if (inS) {
                if (ch === '\\') {
                    escaped = true;
                } else if (ch === '\'') {
                    inS = false;
                }
                buf += ch;
                continue;
            }
            if (inD) {
                if (ch === '\\') {
                    escaped = true;
                } else if (ch === '"') {
                    inD = false;
                }
                buf += ch;
                continue;
            }

            if (ch === '\'') {
                inS = true;
                buf += ch;
                continue;
            }
            if (ch === '"') {
                inD = true;
                buf += ch;
                continue;
            }

            if (ch === '<') { depthAngle++; }
            else if (ch === '>') { depthAngle = Math.max(0, depthAngle - 1); }
            else if (ch === '(') { depthParen++; }
            else if (ch === ')') { depthParen = Math.max(0, depthParen - 1); }
            else if (ch === '{') { depthBrace++; }
            else if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); }
            else if (ch === '[') { depthBracket++; }
            else if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); }

            const atTop = depthAngle === 0 && depthParen === 0 && depthBrace === 0 && depthBracket === 0;
            if (atTop && (ch === ';' || ch === ',')) {
                if (buf.trim()) {
                    parts.push(buf.trim());
                }
                buf = '';
                // allow sequences like ", " to be skipped
                if (next === ' ' || next === '\t') {
                    continue;
                }
                continue;
            }

            buf += ch;
        }

        if (buf.trim()) {
            parts.push(buf.trim());
        }
        return parts;
    }

    private normalizeGenericsInSignature(text: string): string {
        if (!text) {
            return text;
        }
        let code = text;
        let comment = '';
        const cm = code.match(/^(.*?)(\/\/.*)$/);
        if (cm) {
            code = cm[1].trimEnd();
            comment = cm[2];
        }
        let res: string[] = [];
        let depthAngle = 0;
        let inS = false, inD = false;
        const n = code.length;
        for (let i = 0; i < n; i++) {
            const ch = code[i];

            if (inD) {
                if (ch === '\\' && i + 1 < n) {
                    res.push(ch);
                    res.push(code[++i]);
                    continue;
                }
                res.push(ch);
                if (ch === '"') {
                    inD = false;
                }
                continue;
            }
            if (inS) {
                if (ch === '\\' && i + 1 < n) {
                    res.push(ch);
                    res.push(code[++i]);
                    continue;
                }
                res.push(ch);
                if (ch === "'") {
                    inS = false;
                }
                continue;
            }

            if (ch === '"') {
                inD = true;
                res.push(ch);
                continue;
            }
            if (ch === "'") {
                inS = true;
                res.push(ch);
                continue;
            }
            if (ch === '<') {
                while (res.length > 0 && res[res.length - 1] === ' ') {
                    res.pop();
                }
                res.push('<');
                depthAngle++;
                while (i + 1 < n && code[i + 1] === ' ') {
                    i++;
                }
                continue;
            }
            if (ch === ',' && depthAngle > 0) {
                while (res.length > 0 && res[res.length - 1] === ' ') {
                    res.pop();
                }
                res.push(',');
                while (i + 1 < n && code[i + 1] === ' ') {
                    i++;
                }
                continue;
            }
            if (ch === '>') {
                if (depthAngle > 0) {
                    while (res.length > 0 && res[res.length - 1] === ' ') {
                        res.pop();
                    }
                    res.push('>');
                    depthAngle = Math.max(0, depthAngle - 1);
                    let k = i + 1;
                    while (k < n && code[k] === ' ') {
                        k++;
                    }
                    if (k < n) {
                        const next = code[k];
                        if (next === ',' || next === '>' || next === ')') {
                            i = k - 1;
                        }
                    } else {
                        i = k - 1;
                    }
                    continue;
                }
            }
            res.push(ch);
        }
        const normalized = res.join('');
        return comment ? `${normalized} ${comment}` : normalized;
    }
}
