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
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    plugins: [
      offlineBuild(version),
      ...(standalone
        ? [
            {
              name: 'qinglan-standalone-html',
              transformIndexHtml(html: string) {
                return html
                  .replace(
                    '<title>叩仙门：青岚纪</title>',
                    '<title>叩仙门：青岚纪 · 单机版</title>',
                  )
                  .replace(/<link\b[^>]*href="https:\/\/fonts\.loli\.net\/[^>]*>/g, '');
              },
            },
          ]
        : []),
    ],
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./index.html', import.meta.url)),
          ...(!standalone
            ? { monitor: fileURLToPath(new URL('./monitor/index.html', import.meta.url)) }
            : {}),
        },
      },
    },
    define: {
      __QINGLAN_VERSION__: JSON.stringify(version),
      __QINGLAN_STANDALONE__: standalone,
    },
  };
});
