const esbuild = require('esbuild');
const path = require('path');

const coreOutRoot = path.join(__dirname, 'packages/core/out');

const workspaceCoreAlias = {
    name: 'workspace-core-alias',
    setup(build) {
        build.onResolve({filter: /^@tanzz\/thrift-core$/}, () => ({
            path: path.join(coreOutRoot, 'index.js')
        }));
        build.onResolve({filter: /^@tanzz\/thrift-core\//}, args => ({
            path: path.join(coreOutRoot, args.path.slice('@tanzz/thrift-core/'.length))
        }));
    }
};

const sharedConfig = {
    entryPoints: ['packages/vscode/src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'ES2022',
    sourcemap: true,
    keepNames: true,
    minify: false,
    plugins: [workspaceCoreAlias],
};

async function main() {
    const watchMode = process.argv.includes('--watch');
    if (watchMode) {
        const ctx = await esbuild.context(sharedConfig);
        await ctx.watch();
        console.log('[esbuild] watching for changes...');
    } else {
        await esbuild.build(sharedConfig);
        console.log('[esbuild] bundled to dist/extension.js');
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
