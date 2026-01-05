/**
 * 彻底分析点击文件触发其他文件扫描的根本原因
 * 并提供详细的诊断和解决方案
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {ThriftParser} from './ast/parser';
import {collectIncludes} from './ast/utils';
import {ErrorHandler} from './utils/error-handler';
import {CoreDependencies} from './utils/dependencies';

export class ScanningAnalyzer {
    private analysisLog: string[] = [];
    private eventTriggerMap: Map<string, number> = new Map();
    private errorHandler: ErrorHandler;
    private readonly component = 'ScanningAnalyzer';

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 分析点击文件时的事件触发链
     */
    public analyzeClickToScanChain(): void {
        this.logInfo('analyzeClickToScanChain', '🔍 === 分析点击文件触发扫描的根本原因 ===');

        // 1. 文档激活事件监听
        this.logAnalysis('1. 文档激活事件监听');
        const disposables = [];

        // 监听各种可能触发扫描的事件
        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor?.document.languageId === 'thrift') {
                    this.logEvent('onDidChangeActiveTextEditor', editor.document.uri.fsPath);
                    this.analyzeWhyScanning(editor.document);
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidOpenTextDocument(document => {
                if (document.languageId === 'thrift') {
                    this.logEvent('onDidOpenTextDocument', document.uri.fsPath);
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.languageId === 'thrift') {
                    this.logEvent('onDidChangeTextDocument', event.document.uri.fsPath);
                }
            })
        );

        // 2. 符号提供器触发分析
        this.logAnalysis('2. 符号提供器触发分析');
        this.analyzeSymbolProviderTriggers();

        // 3. 引用提供器触发分析
        this.logAnalysis('3. 引用提供器触发分析');
        this.analyzeReferenceProviderTriggers();

        // 4. 诊断管理器触发分析
        this.logAnalysis('4. 诊断管理器触发分析');
        this.analyzeDiagnosticTriggers();

        // 5. 与 JS/TS 对比分析
        this.logAnalysis('5. 与 JS/TS 对比分析');
        this.compareWithBuiltInLanguages();

        this.logInfo('analyzeClickToScanChain', '📊 === 事件触发统计 ===');
        this.printEventStatistics();
    }

    /**
     * 获取分析结果和建议
     */
    public getAnalysisResults(): string {
        return `
🔧 根本原因总结：

1. 架构差异：VS Code 内置语言服务有特权架构，第三方扩展使用标准 LSP
2. 事件触发：onDidChangeActiveTextEditor 每次点击都触发分析
3. 级联分析：include 依赖导致扫描相关文件
4. 缓存策略：简单缓存 vs 智能语义缓存
5. 资源管理：扩展主机进程 vs 独立语言服务进程

💡 解决方案建议：
- 使用最小化提供器（已实现）
- 禁用工作区符号和引用扫描
- 增加更智能的缓存机制
- 实现增量分析而不是全量分析
        `;
    }

    /**
     * 分析为什么特定文档会触发扫描
     */
    private analyzeWhyScanning(document: vscode.TextDocument): void {
        const fileName = path.basename(document.uri.fsPath);
        this.logInfo('analyzeWhyScanning', `分析文件: ${fileName}`);

        // 检查文件内容
        const content = document.getText();
        const ast = ThriftParser.parseWithCache(document);
        const includeNodes = collectIncludes(ast);

        this.logInfo('analyzeWhyScanning', `文件大小: ${content.length} 字符`);
        this.logInfo('analyzeWhyScanning', `include 语句数量: ${includeNodes.length}`);

        if (includeNodes.length > 0) {
            this.logInfo('analyzeWhyScanning', '发现的 include 文件:');
            includeNodes.forEach(include => {
                this.logInfo('analyzeWhyScanning', `    * include "${include.path}"`);
            });
            this.logInfo('analyzeWhyScanning', '⚠️  这些 include 文件会被分析，导致级联扫描！');
        }

        // 检查是否是新打开的文件
        const isNewlyOpened = !this.eventTriggerMap.has(document.uri.fsPath);
        if (isNewlyOpened) {
            this.logInfo('analyzeWhyScanning', '这是新打开的文件，会触发完整分析');
        }
    }

    /**
     * 分析符号提供器的触发机制
     */
    private analyzeSymbolProviderTriggers(): void {
        this.logInfo('analyzeSymbolProviderTriggers', '符号提供器触发机制:');
        this.logInfo('analyzeSymbolProviderTriggers', '- onDidChangeActiveTextEditor → provideDocumentSymbols');
        this.logInfo('analyzeSymbolProviderTriggers', '- provideDocumentSymbols → 解析当前文件结构');
        this.logInfo('analyzeSymbolProviderTriggers', '- 解析文件结构 → 可能触发 include 文件分析');
        this.logInfo('analyzeSymbolProviderTriggers', '- VS Code 内置优化: 缓存符号信息，但扩展可能绕过缓存');
    }

    /**
     * 分析引用提供器的触发机制
     */
    private analyzeReferenceProviderTriggers(): void {
        this.logInfo('analyzeReferenceProviderTriggers', '引用提供器触发机制:');
        this.logInfo('analyzeReferenceProviderTriggers', '- 用户选择 \"Find All References\"');
        this.logInfo('analyzeReferenceProviderTriggers', '- 或 VS Code 自动触发引用分析');
        this.logInfo('analyzeReferenceProviderTriggers', '- provideReferences → 扫描整个工作区');
        this.logInfo('analyzeReferenceProviderTriggers', '- 内置语言服务: 使用索引，第三方扩展: 实时扫描');
    }

    /**
     * 分析诊断管理器的触发机制
     */
    private analyzeDiagnosticTriggers(): void {
        this.logInfo('analyzeDiagnosticTriggers', '诊断管理器触发机制:');
        this.logInfo('analyzeDiagnosticTriggers', '- onDidChangeActiveTextEditor → scheduleAnalysis');
        this.logInfo('analyzeDiagnosticTriggers', '- scheduleAnalysis → analyzeCurrentFile');
        this.logInfo('analyzeDiagnosticTriggers', '- analyzeCurrentFile → findIncludeDependencies');
        this.logInfo('analyzeDiagnosticTriggers', '- findIncludeDependencies → analyzeIncludedFiles');
        this.logInfo('analyzeDiagnosticTriggers', '- 级联反应: included files → their includes → ...');
    }

    /**
     * 与内置语言服务对比
     */
    private compareWithBuiltInLanguages(): void {
        this.logInfo('compareWithBuiltInLanguages', '🔍 VS Code 内置语言服务 vs 第三方扩展:');

        this.logInfo('compareWithBuiltInLanguages', '内置语言服务 (JS/TS/JavaScript):');
        this.logInfo('compareWithBuiltInLanguages', '✓ 独立进程运行，不影响主进程');
        this.logInfo('compareWithBuiltInLanguages', '✓ 智能增量更新，只分析改变的文件');
        this.logInfo('compareWithBuiltInLanguages', '✓ 语义缓存，理解代码依赖关系');
        this.logInfo('compareWithBuiltInLanguages', '✓ 文件系统索引，快速查找引用');
        this.logInfo('compareWithBuiltInLanguages', '✓ 按需加载，不会扫描无关文件');

        this.logInfo('compareWithBuiltInLanguages', '第三方扩展 (我们的 Thrift 插件):');
        this.logInfo('compareWithBuiltInLanguages', '✗ 运行在扩展主机进程，共享资源');
        this.logInfo('compareWithBuiltInLanguages', '✗ 事件驱动，每次激活都重新分析');
        this.logInfo('compareWithBuiltInLanguages', '✗ 简单缓存，不理解语义依赖');
        this.logInfo('compareWithBuiltInLanguages', '✗ 实时扫描，没有预建索引');
        this.logInfo('compareWithBuiltInLanguages', '✗ 级联分析，会扫描所有相关文件');
    }

    /**
     * 记录事件
     */
    private logEvent(eventName: string, filePath: string): void {
        const key = `${eventName}:${path.basename(filePath)}`;
        this.eventTriggerMap.set(key, (this.eventTriggerMap.get(key) || 0) + 1);

        const timestamp = new Date().toISOString().substr(11, 8);
        this.logInfo('logEvent', `[${timestamp}] ${eventName}: ${path.basename(filePath)}`);
    }

    /**
     * 记录分析
     */
    private logAnalysis(message: string): void {
        this.logInfo('logAnalysis', `📋 ${message}`);
        this.analysisLog.push(message);
    }

    /**
     * 打印事件统计
     */
    private printEventStatistics(): void {
        this.logInfo('printEventStatistics', '事件触发次数统计:');
        for (const [key, count] of this.eventTriggerMap.entries()) {
            this.logInfo('printEventStatistics', `  - ${key}: ${count} 次`);
        }
    }

    private logInfo(operation: string, message: string): void {
        this.errorHandler.handleInfo(message, {
            component: this.component,
            operation
        });
    }
}

// 导出分析器
export function createScanningAnalyzer(deps?: Partial<CoreDependencies>) {
    return new ScanningAnalyzer(deps);
}

export const scanningAnalyzer = createScanningAnalyzer();
