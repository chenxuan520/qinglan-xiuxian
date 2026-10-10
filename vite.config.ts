import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { offlineBuild } from './scripts/offline-build.ts';

// 构建时注入 git describe 版本字符串（与 roadbook 的 update_version.sh 同口径），
// 展示在关于面板；构建选项仍由命令行参数决定，本文件不覆盖。
function describeVersion() {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf8' }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

const version = describeVersion();
export default defineConfig({
  plugins: [offlineBuild(version)],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        monitor: fileURLToPath(new URL('./monitor/index.html', import.meta.url)),
      },
    },
  },
  define: {
    __QINGLAN_VERSION__: JSON.stringify(version),
  },
});
