/**
 * 彻底分析点击文件触发其他文件扫描的根本原因
 * 并提供详细的诊断和解决方案
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {ThriftParser} from './ast/parser';
import {collectIncludes} from './ast/utils';

export class ScanningAnalyzer {
    private static instance: ScanningAnalyzer;
    private analysisLog: string[] = [];
    private eventTriggerMap: Map<string, number> = new Map();

    public static getInstance(): ScanningAnalyzer {
        if (!ScanningAnalyzer.instance) {
            ScanningAnalyzer.instance = new ScanningAnalyzer();
        }
        return ScanningAnalyzer.instance;
    }

    /**
     * 分析点击文件时的事件触发链
     */
    public analyzeClickToScanChain(): void {
        console.log('\n🔍 === 分析点击文件触发扫描的根本原因 ===\n');

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

        console.log('\n📊 === 事件触发统计 ===');
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
        console.log(`\n  分析文件: ${fileName}`);

        // 检查文件内容
        const content = document.getText();
        const ast = ThriftParser.parseWithCache(document);
        const includeNodes = collectIncludes(ast);

        console.log(`  - 文件大小: ${content.length} 字符`);
        console.log(`  - include 语句数量: ${includeNodes.length}`);

        if (includeNodes.length > 0) {
            console.log('  - 发现的 include 文件:');
            includeNodes.forEach(include => {
                console.log(`    * include "${include.path}"`);
            });
            console.log('  ⚠️  这些 include 文件会被分析，导致级联扫描！');
        }

        // 检查是否是新打开的文件
        const isNewlyOpened = !this.eventTriggerMap.has(document.uri.fsPath);
        if (isNewlyOpened) {
            console.log('  - 这是新打开的文件，会触发完整分析');
        }
    }

    /**
     * 分析符号提供器的触发机制
     */
    private analyzeSymbolProviderTriggers(): void {
        console.log('\n  符号提供器触发机制:');
        console.log('  - onDidChangeActiveTextEditor → provideDocumentSymbols');
        console.log('  - provideDocumentSymbols → 解析当前文件结构');
        console.log('  - 解析文件结构 → 可能触发 include 文件分析');
        console.log('  - VS Code 内置优化: 缓存符号信息，但扩展可能绕过缓存');
    }

    /**
     * 分析引用提供器的触发机制
     */
    private analyzeReferenceProviderTriggers(): void {
        console.log('\n  引用提供器触发机制:');
        console.log('  - 用户选择 "Find All References"');
        console.log('  - 或 VS Code 自动触发引用分析');
        console.log('  - provideReferences → 扫描整个工作区');
        console.log('  - 内置语言服务: 使用索引，第三方扩展: 实时扫描');
    }

    /**
     * 分析诊断管理器的触发机制
     */
    private analyzeDiagnosticTriggers(): void {
        console.log('\n  诊断管理器触发机制:');
        console.log('  - onDidChangeActiveTextEditor → scheduleAnalysis');
        console.log('  - scheduleAnalysis → analyzeCurrentFile');
        console.log('  - analyzeCurrentFile → findIncludeDependencies');
        console.log('  - findIncludeDependencies → analyzeIncludedFiles');
        console.log('  - 级联反应: included files → their includes → ...');
    }

    /**
     * 与内置语言服务对比
     */
    private compareWithBuiltInLanguages(): void {
        console.log('\n  🔍 VS Code 内置语言服务 vs 第三方扩展:');

        console.log('\n  内置语言服务 (JS/TS/JavaScript):');
        console.log('  ✓ 独立进程运行，不影响主进程');
        console.log('  ✓ 智能增量更新，只分析改变的文件');
        console.log('  ✓ 语义缓存，理解代码依赖关系');
        console.log('  ✓ 文件系统索引，快速查找引用');
        console.log('  ✓ 按需加载，不会扫描无关文件');

        console.log('\n  第三方扩展 (我们的 Thrift 插件):');
        console.log('  ✗ 运行在扩展主机进程，共享资源');
        console.log('  ✗ 事件驱动，每次激活都重新分析');
        console.log('  ✗ 简单缓存，不理解语义依赖');
        console.log('  ✗ 实时扫描，没有预建索引');
        console.log('  ✗ 级联分析，会扫描所有相关文件');
    }

    /**
     * 记录事件
     */
    private logEvent(eventName: string, filePath: string): void {
        const key = `${eventName}:${path.basename(filePath)}`;
        this.eventTriggerMap.set(key, (this.eventTriggerMap.get(key) || 0) + 1);

        const timestamp = new Date().toISOString().substr(11, 8);
        console.log(`  [${timestamp}] ${eventName}: ${path.basename(filePath)}`);
    }

    /**
     * 记录分析
     */
    private logAnalysis(message: string): void {
        console.log(`\n📋 ${message}`);
        this.analysisLog.push(message);
    }

    /**
     * 打印事件统计
     */
    private printEventStatistics(): void {
        console.log('\n  事件触发次数统计:');
        for (const [key, count] of this.eventTriggerMap.entries()) {
            console.log(`  - ${key}: ${count} 次`);
        }
    }
}

// 导出分析器
export const scanningAnalyzer = ScanningAnalyzer.getInstance();
