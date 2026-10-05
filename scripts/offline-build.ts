import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function offlineBuild(version: string): Plugin {
  let config: ResolvedConfig;
  let build = '';
  return {
    name: 'qinglan-offline-resources',
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
      const hash = createHash('sha256')
        .update(version)
        .update(config.base)
        .update(JSON.stringify(config.env || {}));
      const inputs = [
        ...files(resolve(config.root, 'src')),
        ...files(resolve(config.root, 'public')),
        ...['index.html', 'vite.config.ts', 'scripts/offline-build.ts', 'package-lock.json'].map(
          (path) => resolve(config.root, path),
        ),
      ].sort();
      for (const path of inputs)
        hash.update(relative(config.root, path)).update(readFileSync(path));
      build = hash.digest('hex').slice(0, 24);
      config.define.__QINGLAN_BUILD_ID__ = JSON.stringify(build);
    },
    transform(code, id) {
      if (!id.endsWith('.css')) return;
      return code.replace(
        /url\((['"]?)(\/assets\/[^'"?\s)]+)\1\)/g,
        (_match, quote, path) => `url(${quote}${path}?qinglan-build=${build}${quote})`,
      );
    },
    closeBundle() {
      if (config.command !== 'build') return;
      const output = resolve(config.root, config.build.outDir);
      const resources = files(output)
        .filter((path) => !relative(output, path).startsWith('offline-manifest'))
        .sort()
        .map((path) => {
          const contents = readFileSync(path);
          return {
            path: relative(output, path).split('\\').join('/'),
            bytes: contents.length,
            sha256: createHash('sha256').update(contents).digest('hex'),
          };
        });
      const manifest = JSON.stringify({
        schema: 1,
        build,
        version,
        base: config.base,
        bytes: resources.reduce((total, entry) => total + entry.bytes, 0),
        resources,
      });
      // 固定版本清单避免部署中途把两版资源拼在一起；最新清单供排查与检查构建。
      writeFileSync(join(output, `offline-manifest-${build}.json`), manifest);
      writeFileSync(join(output, 'offline-manifest.json'), manifest);
    },
  };
}
