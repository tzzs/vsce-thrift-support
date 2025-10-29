import * as vscode from 'vscode';

export class ThriftSignatureHelpProvider implements vscode.SignatureHelpProvider {
    
    public provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.SignatureHelpContext
    ): vscode.SignatureHelp | undefined {
        
        const line = document.lineAt(position.line).text;
        const textBeforeCursor = line.substring(0, position.character);
        
        // 检查是否在函数调用或定义中
        const functionMatch = this.findFunctionContext(textBeforeCursor);
        if (!functionMatch) {
            return undefined;
        }
        
        const { functionName, parameterIndex, isDefinition } = functionMatch;
        
        // 获取函数签名信息
        const signature = this.getFunctionSignature(document, functionName, isDefinition);
        if (!signature) {
            return undefined;
        }
        
        const signatureHelp = new vscode.SignatureHelp();
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = parameterIndex;
        
        const signatureInfo = new vscode.SignatureInformation(signature);
        
        // 添加参数信息
        const parameters = this.extractParameters(signature);
        parameters.forEach((param, index) => {
            const paramInfo = new vscode.ParameterInformation(param);
            paramInfo.documentation = this.getParameterDocumentation(functionName, param, index);
            signatureInfo.parameters.push(paramInfo);
        });
        
        signatureInfo.documentation = this.getFunctionDocumentation(functionName, isDefinition);
        signatureHelp.signatures.push(signatureInfo);
        
        return signatureHelp;
    }
    
    private findFunctionContext(textBeforeCursor: string): { functionName: string; parameterIndex: number; isDefinition: boolean } | undefined {
        // 匹配函数调用：functionName(param1, param2, ...)
        const callMatch = textBeforeCursor.match(/(\w+)\s*\(([^)]*)$/);
        if (callMatch) {
            const [, functionName, paramsText] = callMatch;
            // 计算参数索引
            const paramCount = paramsText.split(',').filter(p => p.trim().length > 0).length;
            return { functionName, parameterIndex: paramCount, isDefinition: false };
        }
        
        // 匹配函数定义：void functionName(param1, param2, ...)
        const defMatch = textBeforeCursor.match(/(?:void|oneway\s+void)\s+(\w+)\s*\(([^)]*)$/);
        if (defMatch) {
            const [, functionName, paramsText] = defMatch;
            const paramCount = paramsText.split(',').filter(p => p.trim().length > 0).length;
            return { functionName, parameterIndex: paramCount, isDefinition: true };
        }
        
        return undefined;
    }
    
    private getFunctionSignature(document: vscode.TextDocument, functionName: string, isDefinition: boolean): string | undefined {
        const text = document.getText();
        
        if (isDefinition) {
            // 如果是函数定义，从当前文档中查找
            const defRegex = new RegExp(`(oneway\s+)?void\\s+${functionName}\\s*\\(([^)]*?)\\)`, 'g');
            const match = defRegex.exec(text);
            if (match) {
                const returnType = match[1] ? 'oneway void' : 'void';
                return `${returnType} ${functionName}(${match[2]})`;
            }
        } else {
            // 如果是函数调用，查找对应的服务方法定义
            const serviceMethods = this.parseServiceMethods(text);
            const method = serviceMethods.find(m => m.name === functionName);
            if (method) {
                return `${method.returnType} ${method.name}(${method.parameters.join(', ')})`;
            }
        }
        
        return undefined;
    }
    
    private parseServiceMethods(text: string): Array<{name: string; returnType: string; parameters: string[]}> {
        const methods: Array<{name: string; returnType: string; parameters: string[]}> = [];
        const lines = text.split('\n');
        let currentService = null;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // 检测服务定义开始
            const serviceMatch = trimmed.match(/^service\s+(\w+)(?:\s+extends\s+(\w+))?/);
            if (serviceMatch) {
                currentService = serviceMatch[1];
                continue;
            }
            
            // 检测服务方法
            if (currentService && trimmed.includes('(')) {
                const methodMatch = trimmed.match(/^(oneway\s+)?(void|[A-Za-z_][A-Za-z0-9_]*)\s+(\w+)\s*\(([^)]*)\)/);
                if (methodMatch) {
                    const returnType = methodMatch[1] ? 'oneway void' : methodMatch[2];
                    const methodName = methodMatch[3];
                    const paramsText = methodMatch[4];
                    
                    // 解析参数
                    const parameters = paramsText.split(',').map(param => param.trim()).filter(p => p.length > 0);
                    
                    methods.push({
                        name: methodName,
                        returnType,
                        parameters
                    });
                }
            }
            
            // 检测服务定义结束
            if (currentService && trimmed === '}') {
                currentService = null;
            }
        }
        
        return methods;
    }
    
    private extractParameters(signature: string): string[] {
        const match = signature.match(/\(([^)]*)\)/);
        if (!match) {
            return [];
        }
        
        const paramsText = match[1];
        return paramsText.split(',').map(param => param.trim()).filter(p => p.length > 0);
    }
    
    private getParameterDocumentation(functionName: string, parameter: string, index: number): string {
        // 简单的参数文档生成
        const paramName = parameter.split(/\s+/).pop() || `param${index + 1}`;
        const paramType = parameter.split(/\s+/).slice(0, -1).join(' ');
        return `Parameter ${index + 1}: ${paramName} (${paramType})`;
    }
    
    private getFunctionDocumentation(functionName: string, isDefinition: boolean): string {
        const type = isDefinition ? 'Service method definition' : 'Service method call';
        return `${type}: ${functionName}`;
    }
}