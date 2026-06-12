import * as vscode from 'vscode';
import {CoreDependencies} from './utils/dependencies';
import {config} from '@tanzz/thrift-core';

import {ThriftFormattingProvider} from './formatting-bridge';
import {ThriftDefinitionProvider} from './definition-provider';
import {ThriftHoverProvider} from './hover-provider';
import {registerDiagnostics} from './diagnostics';
import {registerCompletionProvider} from './completion-provider';
import {registerDocumentSymbolProvider} from './document-symbol-provider';
import {registerWorkspaceSymbolProvider} from './workspace-symbol-provider';
import {registerReferencesProvider} from './references-provider';
import {registerFoldingRangeProvider} from './folding-range-provider';
import {registerSelectionRangeProvider} from './selection-range-provider';
import {ThriftRenameProvider} from './rename-provider';
import {ThriftRefactorCodeActionProvider} from './code-actions-provider';
import {registerSemanticTokensProvider} from './semantic-tokens-provider';
import {registerCallHierarchyProvider} from './call-hierarchy-provider';
import {registerTypeHierarchyProvider} from './type-hierarchy-provider';
import {registerDocumentHighlightProvider} from './document-highlight-provider';
import {setupIncrementalParsingTracking} from './utils/incremental-parser';
import {registerIncludeDocumentLinkProvider} from './include-document-link-provider';
import {registerSignatureHelpProvider} from './signature-help-provider';
import {registerInlayHintsProvider} from './inlay-hints-provider';
import {registerCodeLensProvider} from './codelens-provider';

/**
 * 注册所有语言特性提供者。
 * @param context 扩展上下文
 * @param deps 核心依赖
 */
export function registerProviders(context: vscode.ExtensionContext, deps: CoreDependencies) {
    // Register formatting provider
    const formattingProvider = new ThriftFormattingProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('thrift', formattingProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider('thrift', formattingProvider)
    );

    // Track dirty ranges for incremental formatting/analysis
    const tracker = deps.incrementalTracker;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => tracker.markChanges(event))
    );

    // Setup incremental parsing tracking
    setupIncrementalParsingTracking(context);

    // Register definition provider
    const definitionProvider = new ThriftDefinitionProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('thrift', definitionProvider)
    );

    // Add file watcher for definition cache
    const fileWatcher = deps.fileWatcher;
    const definitionFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        definitionProvider.clearCache();
    });
    context.subscriptions.push(definitionFileWatcher);

    // Register hover provider
    const hoverProvider = new ThriftHoverProvider(deps);
    context.subscriptions.push(vscode.languages.registerHoverProvider('thrift', hoverProvider));

    // Add file watcher for hover cache
    const hoverFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        hoverProvider.clearCache();
    });
    context.subscriptions.push(hoverFileWatcher);

    // Register diagnostics
    registerDiagnostics(context, deps);

    // Register completion provider
    registerCompletionProvider(context, deps);

    // Register include document links
    registerIncludeDocumentLinkProvider(context, deps);

    // Register signature help for service and interaction method declarations
    registerSignatureHelpProvider(context, deps);

    // Register high-frequency editor affordances
    registerInlayHintsProvider(context, deps);
    registerCodeLensProvider(context, deps);

    // Register document symbol provider
    registerDocumentSymbolProvider(context, deps);

    // Register workspace symbol provider
    registerWorkspaceSymbolProvider(context, deps);

    // Register references provider
    registerReferencesProvider(context, deps);

    // Register folding range provider
    registerFoldingRangeProvider(context, deps);

    // Register selection range provider
    registerSelectionRangeProvider(context, deps);

    // Register rename provider
    context.subscriptions.push(
        vscode.languages.registerRenameProvider('thrift', new ThriftRenameProvider(deps))
    );

    // Register code actions provider
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            'thrift',
            new ThriftRefactorCodeActionProvider(deps),
            {
                providedCodeActionKinds: [
                    vscode.CodeActionKind.Refactor,
                    vscode.CodeActionKind.RefactorExtract,
                    vscode.CodeActionKind.QuickFix
                ]
            }
        )
    );

    // Phase 6A: Semantic tokens (AST-driven semantic colorization)
    registerSemanticTokensProvider(context, deps);

    // Phase 6B: Call hierarchy (service method override / type reference graph)
    registerCallHierarchyProvider(context, deps);

    // Phase 6C: Type hierarchy (service extends chain + typedef aliases)
    registerTypeHierarchyProvider(context, deps);

    // Phase 6D: Document highlight (in-document identifier occurrences)
    registerDocumentHighlightProvider(context, deps);
}
