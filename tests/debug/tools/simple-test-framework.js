/**
 * 简单的测试框架，兼容 describe 和 it 语法
 * 用于运行使用 Mocha 语法的测试文件
 */

class SimpleTestFramework {
    constructor() {
        this.currentSuite = null;
        this.tests = [];
        this.beforeHooks = [];
        this.afterHooks = [];
        this.results = [];
    }

    describe(name, fn) {
        const suite = {
            name,
            tests: [],
            beforeHooks: [],
            afterHooks: [],
            suites: []
        };
        
        const prevSuite = this.currentSuite;
        this.currentSuite = suite;
        
        try {
            fn();
        } catch (error) {
            console.error(`Suite "${name}" failed:`, error.message);
        }
        
        this.currentSuite = prevSuite;
        
        if (!prevSuite) {
            // 根套件，运行测试
            return this.runSuite(suite);
        } else {
            // 子套件，添加到父套件
            prevSuite.suites.push(suite);
        }
    }

    it(name, fn) {
        if (this.currentSuite) {
            this.currentSuite.tests.push({ name, fn });
        }
    }

    before(fn) {
        if (this.currentSuite) {
            this.currentSuite.beforeHooks.push(fn);
        }
    }

    after(fn) {
        if (this.currentSuite) {
            this.currentSuite.afterHooks.push(fn);
        }
    }

    async runSuite(suite, level = 0) {
        const indent = '  '.repeat(level);
        console.log(`${indent}📋 ${suite.name}`);
        
        let passed = 0;
        let failed = 0;
        
        // 运行 before 钩子
        for (const hook of suite.beforeHooks) {
            try {
                await hook();
            } catch (error) {
                console.error(`${indent}  ❌ Before hook failed:`, error.message);
                return { passed: 0, failed: suite.tests.length };
            }
        }
        
        // 运行测试
        for (const test of suite.tests) {
            try {
                await test.fn();
                console.log(`${indent}  ✅ ${test.name}`);
                passed++;
            } catch (error) {
                console.error(`${indent}  ❌ ${test.name}`);
                console.error(`${indent}     ${error.message}`);
                failed++;
            }
        }
        
        // 运行子套件
        for (const subSuite of suite.suites) {
            const subResult = await this.runSuite(subSuite, level + 1);
            passed += subResult.passed;
            failed += subResult.failed;
        }
        
        // 运行 after 钩子
        for (const hook of suite.afterHooks) {
            try {
                await hook();
            } catch (error) {
                console.error(`${indent}  ❌ After hook failed:`, error.message);
            }
        }
        
        return { passed, failed };
    }
}

// 创建全局测试函数
const framework = new SimpleTestFramework();

global.describe = (name, fn) => framework.describe(name, fn);
global.it = (name, fn) => framework.it(name, fn);
global.before = (fn) => framework.before(fn);
global.after = (fn) => framework.after(fn);

module.exports = SimpleTestFramework;