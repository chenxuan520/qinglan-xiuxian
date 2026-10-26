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
      modulePreload: {
        // 闲谈入口失败后可独立重试，避免断网预载同时缓存其尚未加载的依赖失败。
        resolveDependencies: (file, deps) =>
          /^assets\/npc-chat-[\w-]+\.js$/.test(file) ? [] : deps,
      },
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./index.html', import.meta.url)),
          novel: fileURLToPath(new URL('./novel/index.html', import.meta.url)),
          ...(!standalone
            ? { monitor: fileURLToPath(new URL('./monitor/index.html', import.meta.url)) }
            : {}),
        },
        output: {
          // 共享块缩短依赖表路径；懒入口保留名称供加载失败后重试，模块边界、兼容代码与预算计量不变。
          chunkFileNames: (chunk) =>
            chunk.isDynamicEntry ? 'assets/[name]-[hash].js' : 'assets/[hash].js',
        },
      },
    },
    define: {
      __QINGLAN_VERSION__: JSON.stringify(version),
      __QINGLAN_STANDALONE__: standalone,
    },
  };
});
