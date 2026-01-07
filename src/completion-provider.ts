import * as vscode from 'vscode';
import { CoreDependencies } from './utils/dependencies';
import { ThriftCompletionProvider } from './completion/provider';

export { ThriftCompletionProvider } from './completion/provider';

/**
 * 注册 CompletionProvider。
 */
export function registerCompletionProvider(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const provider = new ThriftCompletionProvider(deps);

    const disposable = vscode.languages.registerCompletionItemProvider(
        'thrift',
        provider,
        '.',
        '"',
        "'",
        ':',
        ' ',
        '='
    );

    context.subscriptions.push(disposable);
}
