// 检查真实发布目录，防止 tag 误打联网包或夹带旧 monitor/后端模块。
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve(process.argv[2] || 'artifacts/standalone');
const html = readFileSync(join(directory, 'index.html'), 'utf8');
assert.match(html, /<title>叩仙门：青岚纪 · 单机版<\/title>/);
assert.equal(existsSync(join(directory, 'monitor')), false, '单机包不得夹带监控入口');
// 对同一份相对路径产物分别按根目录和搬入子目录解析；不另建预览HTML或第二服务。
for (const page of ['index.html', 'novel/index.html']) {
  const content = readFileSync(join(directory, page), 'utf8');
  for (const [tag] of content.matchAll(/<(?:script|link|img|source|audio|video|iframe)\b[^>]*>/g)) {
    if (/rel="canonical"/.test(tag)) continue;
    for (const [, path] of tag.matchAll(/(?:src|href|poster)="([^"]+)"/g)) {
      assert.doesNotMatch(path, /^(?:https?:)?\/\//, `${page} 不得加载外部资源`);
      for (const base of ['https://static.test/', 'https://static.test/games/qinglan/']) {
        const url = new URL(path, new URL(page, base));
        assert.ok(url.href.startsWith(base), `${page} 静态入口引用越界：${url.href}`);
        assert.equal(
          existsSync(
            join(directory, decodeURIComponent(url.pathname.slice(new URL(base).pathname.length))),
          ),
          true,
          `${page}: ${url.href}`,
        );
      }
    }
  }
}
const manifest = JSON.parse(readFileSync(join(directory, 'offline-manifest.json'), 'utf8'));
assert.equal(manifest.base, './', '默认单机包使用可搬动的相对路径');
assert.match(manifest.build, /^[a-f0-9]{24}$/);
assert.ok(
  manifest.resources.some((entry: { path: string }) => entry.path === 'novel/index.html'),
  '单机包离线清单须包含独立小说入口',
);
let bytes = 0;
let editionLabel = false;
for (const entry of manifest.resources) {
  assert.doesNotMatch(entry.path, /(?:^|\/)monitor(?:\/|-)|\.(?:woff2?|ttf|otf)$/i);
  const buffer = readFileSync(join(directory, entry.path));
  assert.equal(buffer.length, entry.bytes, entry.path);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), entry.sha256, entry.path);
  bytes += buffer.length;
  if (entry.path.endsWith('.js') && entry.path.startsWith('assets/')) {
    const source = buffer.toString('utf8');
    assert.doesNotMatch(
      source,
      /qinglan-npc-ai|qinglan-ads|\/v1\/ad|\/debug\/access|\/story-image|\/journey-appraisal|\/monitor\/stats|googlesyndication/,
      entry.path,
    );
    if (source.includes('单机版')) editionLabel = true;
  }
}
assert.equal(bytes, manifest.bytes);
assert.equal(editionLabel, true, '游戏内须标注单机版');
console.log(
  `单机包检查通过：${manifest.resources.length} 个资源，无游戏后端、外部字体、SDK或监控入口。`,
);
