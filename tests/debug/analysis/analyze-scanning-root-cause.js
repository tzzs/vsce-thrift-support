/**
 * 运行扫描分析器来诊断点击触发扫描的根本原因
 */
const {scanningAnalyzer} = require('../out/debug/scanning-analyzer');

console.log('🚀 启动点击触发扫描根本原因分析...\n');

// 运行分析器
scanningAnalyzer.analyzeClickToScanChain();

// 输出分析结果
console.log(scanningAnalyzer.getAnalysisResults());
