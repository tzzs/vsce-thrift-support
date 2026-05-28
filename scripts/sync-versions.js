/**
 * 同步根 package.json 版本号到所有子包。
 * 用于 release-please 更新根版本后，将版本号传播到 packages/core 和 packages/cli。
 */
const fs = require('fs');
const path = require('path');

const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const version = rootPkg.version;

const subPackages = ['packages/core', 'packages/cli'];

for (const dir of subPackages) {
    const pkgPath = path.join(__dirname, '..', dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.version !== version) {
        pkg.version = version;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n', 'utf-8');
        console.log(`Updated ${dir}/package.json to v${version}`);
    } else {
        console.log(`${dir}/package.json already at v${version}`);
    }
}
