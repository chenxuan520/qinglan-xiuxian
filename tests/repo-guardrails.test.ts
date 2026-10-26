// 把 AGENTS.md 中可机械判定的仓库约定落成测试；文档只保留原则并指向此处。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function walk(dir: string, skip: Set<string>, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, skip, out);
    else out.push(relative(root, path).split('\\').join('/'));
  }
  return out;
}

test('锁文件只引用公网官方 npm 源，不残留内网镜像', () => {
  for (const lock of ['package-lock.json', 'scripts/browser-tools/package-lock.json']) {
    const hosts = new Set(
      [...read(lock).matchAll(/"resolved": "https:\/\/([^/"]+)/g)].map((match) => match[1]),
    );
    assert.ok(hosts.size > 0, `${lock} 应含 resolved 地址`);
    assert.deepEqual([...hosts], ['registry.npmjs.org'], `${lock} 出现非官方源：${[...hosts]}`);
  }
});

test('游戏依赖不引入浏览器驱动；浏览器回归只经 browser-tools 的 Chrome DevTools MCP', () => {
  const drivers =
    /^(puppeteer|puppeteer-core|playwright|playwright-core|@playwright\/test|selenium-webdriver|webdriverio)$/;
  for (const manifest of ['package.json', 'scripts/browser-tools/package.json']) {
    const pkg = JSON.parse(read(manifest));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert.deepEqual(
      names.filter((name) => drivers.test(name)),
      [],
      `${manifest} 不得依赖浏览器驱动`,
    );
  }
});

test('仓库只保留三个正式 HTML 入口，不提交验证页或入口副本', () => {
  const skip = new Set(['.git', 'node_modules', 'artifacts', 'dist']);
  const html = walk(root, skip).filter((path) => path.endsWith('.html'));
  assert.deepEqual(html.sort(), ['index.html', 'monitor/index.html', 'novel/index.html']);
});

test('样式层叠顺序固定：styles.ts 按原顺序加载十二份样式，battle-hud.css 在其后', () => {
  const order = [...read('src/styles.ts').matchAll(/^import '\.\/([^']+\.css)';$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(order, [
    'style.css',
    'lobby.css',
    'opening.css',
    'catalog.css',
    'battle.css',
    'results.css',
    'responsive.css',
    'progression.css',
    'journey.css',
    'meta.css',
    'home-details.css',
    'interface-tour.css',
  ]);
  const main = read('src/main.ts');
  const styles = main.indexOf("import './styles.ts';");
  const hud = main.indexOf("import './battle-hud.css';");
  assert.ok(styles >= 0 && hud > styles, 'battle-hud.css 必须在 styles.ts 之后加载');
});

test('游戏样式不使用吸顶；标签、分类、筛选与分页栏不得固定定位', () => {
  const sheets = readdirSync(join(root, 'src')).filter(
    // 小说阅读器与公开监控是独立页面，不属于游戏面板。
    (name) => name.endsWith('.css') && !['novel.css', 'monitor.css'].includes(name),
  );
  // 覆盖单复数类名（如 .book-tabs、.mortal-filters、.collection-pages）与分类栏；导览面板不属于栏位。
  const barSelector = /(tabs?|filters?|categor(?:y|ies)|pager|pages|pagination)\b/i;
  for (const sheet of sheets) {
    const css = read(`src/${sheet}`);
    assert.doesNotMatch(css, /position:\s*sticky/, `${sheet} 出现吸顶`);
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (/position:\s*fixed/.test(body))
        assert.doesNotMatch(
          selector.trim(),
          barSelector,
          `${sheet} 固定了栏位：${selector.trim()}`,
        );
  }
});

test('对外介绍只指向唯一官网，不以固定数量宣传法宝、功法、秘境或丹药', () => {
  const readme = read('README.md');
  const index = read('index.html');
  assert.match(readme, /https:\/\/xiuxian\.011203\.xyz\//);
  assert.doesNotMatch(readme, /github\.io\/qinglan-xiuxian/, 'README 只放唯一官网');
  const counted =
    /[0-9０-９一二三四五六七八九十百千]+\s*(?:件|种|门|个|处|味|部)\s*(?:法宝|功法|秘境|丹药)/;
  assert.doesNotMatch(readme, counted);
  for (const [, content] of index.matchAll(/<meta\b[^>]*content="([^"]*)"/g))
    assert.doesNotMatch(content, counted);
});
