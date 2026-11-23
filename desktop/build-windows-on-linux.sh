#!/usr/bin/env bash
# يبني مثبِّت ويندوز على لينكس دون Wine (الطريقة المستعملة لبناء النسخة 1.0.0).
# Builds the Windows installer on Linux without Wine. Needs: Node 20+, makensis (apt install nsis).
# Usage (from the desktop/ folder):  bash build-windows-on-linux.sh
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(node -p "require('./package.json').version")
npm install --no-audit --no-fund
npm install --no-save --no-audit --no-fund resedit@2.0.3 pe-library@1.0.1
# 1) package the app without the Wine-only exe editing step
npx electron-builder --win --x64 --dir -c.win.signAndEditExecutable=false
# 2) embed the icon and version details in ADC.exe (pure JavaScript)
node seticon.js dist/win-unpacked/ADC.exe ../icons/icon.ico "$VERSION"
# 3) build the installer with native makensis
makensis -V2 -DVERSION="$VERSION" -DSRC="$PWD/dist/win-unpacked" -DICON="$PWD/../icons/icon.ico" -DOUT="$PWD/dist/ADC-Setup-$VERSION-x64.exe" installer.nsi
echo "Built: dist/ADC-Setup-$VERSION-x64.exe"
