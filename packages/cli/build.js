const esbuild = require('esbuild');
const path = require('path');

const pkg = require('./package.json');
const coreOutRoot = path.join(__dirname, '..', 'core', 'out');

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

async function main() {
    await esbuild.build({
        entryPoints: [path.join(__dirname, 'src/index.ts')],
        bundle: true,
        outfile: path.join(__dirname, 'dist/cli.js'),
        format: 'cjs',
        platform: 'node',
        target: 'ES2022',
        banner: {js: '#!/usr/bin/env node'},
        sourcemap: true,
        keepNames: true,
        minify: false,
        define: {
            'CLI_VERSION': JSON.stringify(pkg.version),
        },
        plugins: [workspaceCoreAlias],
        // @tanzz/thrift-core is NOT external → bundled into cli.js (zero runtime deps)
    });
    console.log('[esbuild] CLI bundled to dist/cli.js');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
