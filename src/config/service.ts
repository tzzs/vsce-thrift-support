import * as vscode from 'vscode';
import {CacheConfig, config, MemoryConfig} from './index';

/**
 * 配置变更事件
 */
export interface ConfigChange {
    key: string;
    oldValue: unknown;
    newValue: unknown;
}

/**
 * 配置服务 - 统一管理所有配置读取
 */
export class ConfigService {
    private readonly workspaceConfig: vscode.WorkspaceConfiguration;
    private readonly defaults = config;
    private readonly listeners: Array<(changes: ConfigChange[]) => void> = [];

    constructor() {
        this.workspaceConfig = vscode.workspace.getConfiguration('thrift');
    }

    /**
     * 获取配置值
     * @param key 配置键（点分隔路径，如 'format.indentSize'）
     * @param fallback 回退值
     * @returns 配置值
     */
    get<T>(key: string, fallback?: T): T {
        const value = this.workspaceConfig.get<T>(key);
        if (value === undefined) {
            return fallback !== undefined ? fallback : (this.getFromDefaults(key) as T);
        }
        return value;
    }

    /**
     * 从默认配置中获取值
     * @param key 配置键
     * @returns 默认值
     */
    private getFromDefaults(key: string): unknown {
        const parts = key.split('.');
        let current: unknown = this.defaults;

        for (const part of parts) {
            if (current && typeof current === 'object') {
                const record = current as Record<string, unknown>;
                if (part in record) {
                    current = record[part];
                    continue;
                }
                return undefined;
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * 获取缓存配置
     * @returns 缓存配置
     */
    getCacheConfig(): CacheConfig {
        return this.defaults.cache;
    }

    /**
     * 获取内存配置
     * @returns 内存配置
     */
    getMemoryConfig(): MemoryConfig {
        return this.defaults.memory;
    }

    /**
     * 监听配置变更
     * @param callback 变更回调
     * @returns Disposable 对象，用于取消监听
     */
    onDidChange(callback: (changes: ConfigChange[]) => void): vscode.Disposable {
        this.listeners.push(callback);

        const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('thrift')) {
                const changes: ConfigChange[] = [];
                const affectedKeys = this.getAffectedKeys(event);

                for (const key of affectedKeys) {
                    const oldValue = this.get<unknown>(key);
                    // Note: We can't easily get the new value without re-reading
                    // For simplicity, we'll just notify that the config changed
                    changes.push({
                        key,
                        oldValue,
                        newValue: this.workspaceConfig.get<unknown>(key)
                    });
                }

                if (changes.length > 0) {
                    this.listeners.forEach(listener => listener(changes));
                }
            }
        });

        return {
            dispose: () => {
                const index = this.listeners.indexOf(callback);
                if (index > -1) {
                    this.listeners.splice(index, 1);
                }
                disposable.dispose();
            }
        };
    }

    /**
     * 获取受影响的配置键
     * @param event 配置变更事件
     * @returns 受影响的配置键列表
     */
    private getAffectedKeys(event: vscode.ConfigurationChangeEvent): string[] {
        const keys: string[] = [];

        // 检查所有可能的配置键
        const checkKey = (prefix: string, obj: unknown) => {
            if (!obj || typeof obj !== 'object') {
                return;
            }
            const record = obj as Record<string, unknown>;
            for (const [key, value] of Object.entries(record)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (event.affectsConfiguration(`thrift.${fullKey}`)) {
                    keys.push(fullKey);
                }
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    checkKey(fullKey, value);
                }
            }
        };

        checkKey('', this.defaults);

        return keys;
    }

    /**
     * 验证配置值
     * @param key 配置键
     * @param value 值
     * @returns 验证结果
     */
    validate(key: string, value: unknown): {valid: boolean; error?: string} {
        switch (key) {
            case 'format.indentSize':
                if (typeof value !== 'number' || value < 1 || value > 8) {
                    return {valid: false, error: 'Indent size must be between 1 and 8'};
                }
                break;
            case 'format.maxLineLength':
                if (typeof value !== 'number' || value < 40 || value > 200) {
                    return {valid: false, error: 'Max line length must be between 40 and 200'};
                }
                break;
            default:
                // 其他配置使用宽松验证
                break;
        }
        return {valid: true};
    }

    /**
     * 重置配置为默认值
     * @param key 配置键（可选，如果未提供则重置所有配置）
     */
    async reset(key?: string): Promise<void> {
        if (key) {
            await this.workspaceConfig.update(key, undefined, vscode.ConfigurationTarget.Global);
        } else {
            // 重置所有 thrift 配置
            const keys = Object.keys(this.defaults);
            for (const k of keys) {
                await this.workspaceConfig.update(k, undefined, vscode.ConfigurationTarget.Global);
            }
        }
    }
}

/**
 * 配置服务单例
 */
export const configService = new ConfigService();
