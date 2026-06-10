#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
    return fs.existsSync(path.join(root, relativePath));
}

function expect(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

function isExternalLink(target) {
    return /^(https?:|mailto:)/.test(target);
}

function normalizeLinkTarget(target) {
    const withoutAnchor = target.split("#")[0];
    return withoutAnchor.replace(/^<|>$/g, "");
}

function checkMarkdownLinks(relativePath) {
    const source = read(relativePath);
    const baseDir = path.dirname(path.join(root, relativePath));
    const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
    let match;

    while ((match = linkPattern.exec(source)) !== null) {
        const rawTarget = match[1].trim();
        const target = normalizeLinkTarget(rawTarget);

        if (!target || target.startsWith("#") || isExternalLink(target)) {
            continue;
        }

        const resolved = path.resolve(baseDir, target);
        expect(
            resolved.startsWith(root) && fs.existsSync(resolved),
            `${relativePath} links to missing local target: ${rawTarget}`
        );
    }
}

const packageJson = JSON.parse(read("package.json"));
const packageManager = packageJson.packageManager || "";
const pnpmMatch = packageManager.match(/^pnpm@(.+)$/);
const nodeVersion = read(".nvmrc").trim();
const nodeMajor = nodeVersion.split(".")[0];
const developmentGuide = read("DEVELOPMENT.md");

expect(pnpmMatch, "package.json packageManager must pin pnpm, for example pnpm@11.5.0");
if (pnpmMatch) {
    expect(
        developmentGuide.includes(`pnpm: ${pnpmMatch[1]}`),
        `DEVELOPMENT.md must mention pnpm: ${pnpmMatch[1]} from package.json packageManager`
    );
}

expect(
    developmentGuide.includes(`TypeScript: ${packageJson.devDependencies.typescript}`),
    `DEVELOPMENT.md must mention TypeScript: ${packageJson.devDependencies.typescript} from package.json devDependencies`
);
expect(
    developmentGuide.includes(`@vscode/vsce: ${packageJson.devDependencies["@vscode/vsce"]}`),
    `DEVELOPMENT.md must mention @vscode/vsce: ${packageJson.devDependencies["@vscode/vsce"]} from package.json devDependencies`
);

expect(read(".node-version").trim() === nodeVersion, ".nvmrc and .node-version must match");
expect(
    packageJson.engines && packageJson.engines.node === `>=${nodeMajor} <${Number(nodeMajor) + 1}`,
    `package.json engines.node must match Node ${nodeMajor}.x from .nvmrc`
);
expect(
    developmentGuide.includes(`Node.js: ${nodeMajor}.x`) && developmentGuide.includes(nodeVersion),
    `DEVELOPMENT.md must mention Node.js ${nodeMajor}.x and recommended ${nodeVersion}`
);

for (const workflowName of fs.readdirSync(path.join(root, ".github", "workflows"))) {
    if (!workflowName.endsWith(".yml") && !workflowName.endsWith(".yaml")) {
        continue;
    }

    const workflowPath = path.join(".github", "workflows", workflowName);
    const workflow = read(workflowPath);
    if (workflow.includes("actions/setup-node")) {
        expect(
            workflow.includes(`node-version: ${nodeMajor}.x`),
            `${workflowPath} must use node-version: ${nodeMajor}.x`
        );
    }
}

for (const requiredPath of [
    "AGENTS.md",
    "docs/PROJECT_MAP.md",
    "docs/README.md",
    "ARCHITECTURE.md",
    "DEVELOPMENT.md",
    "tests/README.md",
    "tests/TESTING.md",
    "tests/debug/README.md"
]) {
    expect(exists(requiredPath), `Missing required harness file: ${requiredPath}`);
}

for (const markdownPath of [
    "AGENTS.md",
    "README.md",
    "README.zh-CN.md",
    "ARCHITECTURE.md",
    "DEVELOPMENT.md",
    "docs/PROJECT_MAP.md",
    "docs/README.md",
    "tests/README.md",
    "tests/TESTING.md",
    "tests/debug/README.md"
]) {
    checkMarkdownLinks(markdownPath);
}

if (failures.length > 0) {
    console.error("Harness documentation check failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log("Harness documentation check passed.");
