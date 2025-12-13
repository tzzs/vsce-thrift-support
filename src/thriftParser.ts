
import { StructField, EnumField, ConstField } from './interfaces';

export class ThriftParser {
    // Regex patterns
    public reStructField = /^\s*\d+:\s*(?:required|optional)?\s*.+$/;
    public reEnumField = /^\s*\w+\s*=\s*\d+/;
    public reSpaceBeforeLt = /\s+</g;
    public reSpaceAfterLt = /<\s+/g;
    public reSpaceBeforeGt = /\s+>/g;
    public reSpaceGt = />\s*/g;
    public reSpaceComma = /\s*,\s*/g;
    public reServiceMethod = /^\s*(oneway\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]*>)?\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)(\s*throws\s*\([^)]*\))?\s*[;,]?$/;

    public isStructStart(line: string): boolean {
        return /^(struct|union|exception|service)\b/.test(line);
    }

    public isEnumStart(line: string): boolean {
        return /^enum\b/.test(line);
    }

    public isConstStart(line: string): boolean {
        // Match the start of a const declaration that might span multiple lines
        return /^const\s+\w[\w<>,\s]*\s+\w+\s*=\s*[\[{]/.test(line);
    }

    public isConstField(line: string): boolean {
        // Match a single-line const declaration
        return /^const\s+\w[\w<>,\s]*\s+\w+\s*=/.test(line);
    }

    public isStructField(line: string): boolean {
        // Quick pre-check: first non-space must be a digit
        const t = line.trimStart();
        const c = t.charCodeAt(0);
        if (!(c >= 48 && c <= 57)) { return false; }
        // Match field definitions like: 1: required string name, or 1: string name,
        // Also match complex types like: 1: required list<string> names,
        return this.reStructField.test(line);
    }

    public isEnumField(line: string): boolean {
        // Quick pre-check: first non-space must be a letter or underscore
        const t = line.trimStart();
        const cc = t.charCodeAt(0);
        const isLetter = (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95; // A-Z a-z _
        if (!isLetter) { return false; }
        // Match enum field definitions like: ACTIVE = 1, or INACTIVE = 2,
        return this.reEnumField.test(line);
    }

    public parseStructField(line: string): StructField | null {
        // Parse field: 1: required string name = defaultValue, // comment

        // First, extract the prefix (field number and optional required/optional)
        const prefixMatch = line.match(/^\s*(\d+:\s*(?:required|optional)?\s*)(.*)$/);
        if (!prefixMatch) { return null; }

        const prefix = prefixMatch[1];
        let remainder = prefixMatch[2];

        // Extract id and qualifier from prefix
        // prefix is like "1: required " or "1: "
        const idQualMatch = prefix.match(/^\s*(\d+):\s*((?:required|optional)?\s*)/);
        const id = idQualMatch ? idQualMatch[1] : '';
        const qualifier = idQualMatch ? idQualMatch[2] : '';

        // Extract comment first
        let comment = '';
        const commentMatch = remainder.match(/^(.*)(\/\/.*)$/);
        if (commentMatch) {
            remainder = commentMatch[1].trim();
            comment = commentMatch[2];
        }

        // Extract trailing comma/semicolon and preserve it
        let trailingComma = '';
        const suffixMatch = remainder.match(/^(.*?)([,;]\s*)$/);
        if (suffixMatch) {
            remainder = suffixMatch[1].trim();
            trailingComma = suffixMatch[2];
        }

        // Extract inline annotation parentheses at the end: ( ... ) possibly with spaces
        let annotation = '';
        const annMatch = remainder.match(/^(.*?)(\(.*\))\s*$/);
        if (annMatch) {
            remainder = annMatch[1].trim();
            annotation = annMatch[2];
        }

        // Parse the main content: type fieldname [= defaultvalue]
        const fieldMatch = remainder.match(/^(.+?)\s+(\w+)(?:\s*=\s*(.+))?$/);
        if (!fieldMatch) { return null; }

        let type = fieldMatch[1].trim();
        const name = fieldMatch[2];
        const defaultValue = fieldMatch[3];

        // Clean up the type by removing extra spaces around < > and commas
        type = type
            .replace(this.reSpaceBeforeLt, '<')
            .replace(this.reSpaceAfterLt, '<')
            .replace(this.reSpaceBeforeGt, '>')
            .replace(this.reSpaceGt, '>')
            .replace(this.reSpaceComma, ',');

        // Build suffix with default value and trailing comma
        let suffix = '';
        if (defaultValue) {
            suffix = ` = ${defaultValue.trim()}`;
        }
        if (trailingComma) {
            suffix += trailingComma;
        }

        return {
            line: line,
            id: id,
            qualifier: qualifier,
            type: type,
            name: name,
            suffix: suffix,
            comment: comment,
            annotation: annotation
        };
    }

    public parseEnumField(line: string): EnumField | null {
        // Parse enum field: ACTIVE = 1, // comment
        const match = line.match(/^\s*(\w+)\s*=\s*(\d+)\s*([,;]?\s*(?:\/\/.*)?\s*)$/);
        if (!match) { return null; }

        const name = match[1];
        const value = match[2];
        const suffixAndComment = match[3] || '';

        // Separate suffix (comma/semicolon) from comment
        const commentMatch = suffixAndComment.match(/^([^/]*)(\/.+)$/);
        const suffix = commentMatch ? commentMatch[1].trim() : suffixAndComment.trim();
        const comment = commentMatch ? commentMatch[2] : '';

        return {
            line: line,
            name: name,
            value: value,
            suffix: suffix,
            comment: comment
        };
    }

    public parseConstField(
        source: string
    ): ConstField | null {
        if (!source) { return null; }
        const lines = source.split('\n');
        const header = (lines[0] || '').trim();
        // Match: const <type> <name> = <value>[ // comment]
        const m = header.match(/^const\s+([\w<>,\s]+?)\s+(\w+)\s*=\s*(.*)$/);
        if (!m) { return null; }
        let type = m[1].trim();
        const name = m[2].trim();
        let firstValuePart = (m[3] || '').trim();

        // Extract possible inline comment from the first line's value
        let comment = '';
        const commentIdx = firstValuePart.indexOf('//');
        if (commentIdx >= 0) {
            comment = firstValuePart.slice(commentIdx).trim();
            firstValuePart = firstValuePart.slice(0, commentIdx).trim();
        }

        // Build full value (may be multiline)
        let value = firstValuePart;
        if (lines.length > 1) {
            const rest = lines.slice(1).map(l => l.trim()).join('\n');
            value = (value ? value + '\n' : '') + rest;
        }

        // Normalize generic spacing in type
        type = type
            .replace(this.reSpaceBeforeLt, '<')
            .replace(this.reSpaceAfterLt, '<')
            .replace(this.reSpaceBeforeGt, '>')
            .replace(this.reSpaceGt, '>')
            .replace(this.reSpaceComma, ',');

        return {
            line: header,
            type,
            name,
            value,
            comment
        };
    }
}
