import {DiagnosticSeverity} from '../../types';
import {DIAGNOSTIC_CODES, DiagnosticCode} from '../diagnostic-codes';
import {ThriftIssue} from '../types';

export type DiagnosticRuleCategory = 'syntax' | 'type' | 'service' | 'field' | 'value' | 'enum';
export type DiagnosticRuleSeverityName = 'error' | 'warning' | 'information' | 'hint';

export interface DiagnosticRuleMetadata {
    id: DiagnosticCode;
    defaultSeverity: DiagnosticSeverity;
    category: DiagnosticRuleCategory;
    description: string;
    hasFix: boolean;
}

export interface DiagnosticRuleOverride {
    enabled?: boolean;
    severity?: DiagnosticRuleSeverityName;
}

export interface DiagnosticsRuleOptions {
    rules?: Record<string, boolean | DiagnosticRuleSeverityName | 'off' | DiagnosticRuleOverride>;
}

export const DIAGNOSTIC_RULES: readonly DiagnosticRuleMetadata[] = [
    {
        id: DIAGNOSTIC_CODES.TYPE_UNKNOWN,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'type',
        description: 'Reports unknown type references in fields, arguments, and const declarations.',
        hasFix: true
    },
    {
        id: DIAGNOSTIC_CODES.TYPEDEF_UNKNOWN_BASE,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'type',
        description: 'Reports typedef aliases whose base type cannot be resolved.',
        hasFix: true
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_RETURN_TYPE_UNKNOWN,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports service methods whose return type cannot be resolved.',
        hasFix: true
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_THROWS_UNKNOWN,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports throws clauses whose exception type cannot be resolved.',
        hasFix: true
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_EXTENDS_UNKNOWN,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports services extending unknown parent services.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_EXTENDS_NOT_SERVICE,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports service extends targets that resolve to non-service declarations.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_ONEWAY_RETURN_NOT_VOID,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports oneway methods that return a non-void type.',
        hasFix: true
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_ONEWAY_HAS_THROWS,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports oneway methods that declare throws clauses.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.SERVICE_THROWS_NOT_EXCEPTION,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'service',
        description: 'Reports throws clauses that reference a non-exception type.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.FIELD_DUPLICATE_ID,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'field',
        description: 'Reports duplicate field IDs in struct, union, and exception declarations.',
        hasFix: true
    },
    {
        id: DIAGNOSTIC_CODES.VALUE_TYPE_MISMATCH,
        defaultSeverity: DiagnosticSeverity.Warning,
        category: 'value',
        description: 'Reports default values that do not match the declared type.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.ENUM_VALUE_NOT_INTEGER,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'enum',
        description: 'Reports enum member initializers that are not integer literals.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.SYNTAX_UNMATCHED_CLOSER,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'syntax',
        description: 'Reports unmatched closing braces, brackets, or parentheses.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.SYNTAX_MISMATCHED,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'syntax',
        description: 'Reports mismatched delimiter pairs.',
        hasFix: false
    },
    {
        id: DIAGNOSTIC_CODES.SYNTAX_UNCLOSED,
        defaultSeverity: DiagnosticSeverity.Error,
        category: 'syntax',
        description: 'Reports unclosed braces, brackets, or parentheses.',
        hasFix: false
    }
];

const RULE_BY_ID = new Map<string, DiagnosticRuleMetadata>(DIAGNOSTIC_RULES.map(rule => [rule.id, rule]));

export function getDiagnosticRule(id: string): DiagnosticRuleMetadata | undefined {
    return RULE_BY_ID.get(id);
}

export function applyDiagnosticRuleOptions(
    issues: ThriftIssue[],
    options?: DiagnosticsRuleOptions
): ThriftIssue[] {
    if (options?.rules === undefined) {
        return issues;
    }

    const filtered: ThriftIssue[] = [];
    for (const issue of issues) {
        const ruleId = issue.code;
        if (ruleId === undefined) {
            filtered.push(issue);
            continue;
        }

        const override = normalizeRuleOverride(options.rules[ruleId]);
        if (override.enabled === false) {
            continue;
        }

        if (override.severity === undefined) {
            filtered.push(issue);
            continue;
        }

        filtered.push({
            ...issue,
            severity: severityNameToValue(override.severity)
        });
    }
    return filtered;
}

function normalizeRuleOverride(
    value: boolean | DiagnosticRuleSeverityName | 'off' | DiagnosticRuleOverride | undefined
): DiagnosticRuleOverride {
    if (value === undefined) {
        return {};
    }
    if (typeof value === 'boolean') {
        return {enabled: value};
    }
    if (value === 'off') {
        return {enabled: false};
    }
    if (typeof value === 'string') {
        return {enabled: true, severity: value};
    }
    return value;
}

function severityNameToValue(severity: DiagnosticRuleSeverityName): DiagnosticSeverity {
    switch (severity) {
        case 'error':
            return DiagnosticSeverity.Error;
        case 'warning':
            return DiagnosticSeverity.Warning;
        case 'information':
            return DiagnosticSeverity.Information;
        case 'hint':
            return DiagnosticSeverity.Hint;
        default:
            return DiagnosticSeverity.Error;
    }
}
