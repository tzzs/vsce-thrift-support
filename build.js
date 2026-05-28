const esbuild = require('esbuild');

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
