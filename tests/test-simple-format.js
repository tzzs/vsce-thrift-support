// 简单测试服务缩进格式化
const formatter = {
    formatServiceTest: function (content) {
        const lines = content.split('\n');
        let result = [];
        let inService = false;

        for (let line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('service ')) {
                result.push(trimmed);
                inService = true;
            } else if (inService && trimmed === '}') {
                result.push('  ' + trimmed);  // 2 spaces
                inService = false;
            } else if (inService && trimmed.startsWith('//')) {
                result.push('  ' + trimmed);  // 2 spaces for comments
            } else if (inService && trimmed.includes('Ping(')) {
                result.push('  ' + trimmed);  // 2 spaces for method
            } else if (inService && /^\d+:/.test(trimmed)) {
                result.push('    ' + trimmed);  // 4 spaces for parameters
            } else if (inService && trimmed === ')') {
                result.push('  ' + trimmed);  // 2 spaces for closing
            } else {
                result.push(line);
            }
        }

        return result.join('\n');
    }
};

// 测试内容
const testContent = `service TestService {
// ping
PingResponse Ping(
1: required trace.Trace traceInfo,
2: required PingRequest request
)
}`;

console.log('=== 原始内容 ===');
console.log(testContent);

console.log('\n=== 格式化后 ===');
const formatted = formatter.formatServiceTest(testContent);
console.log(formatted);

// 检查缩进级别