#!/usr/bin/env bash
set -euo pipefail

pkg="package.json"

# 确保 package.json 存在
if [ ! -f "$pkg" ]; then
  echo "package.json not found in $(pwd)" >&2
  exit 1
fi

# 读取当前版本
current_version=$(node -e "console.log(require('./$pkg').version || '')")
if [[ ! "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Unsupported version format: '$current_version' (expected x.y.z)" >&2
  exit 1
fi

# 计算新版本（补丁号 +1）
IFS='.' read -r major minor patch <<<"$current_version"
new_patch=$((patch + 1))
new_version="${major}.${minor}.${new_patch}"

echo "Bumping version: $current_version -> $new_version"
# 写回 package.json
node -e "const fs=require('fs');const pkg=require('./$pkg');pkg.version='$new_version';fs.writeFileSync('./$pkg', JSON.stringify(pkg,null,2)+ '\n');"

# 打包
echo "Running npm run package..."
npm run package
