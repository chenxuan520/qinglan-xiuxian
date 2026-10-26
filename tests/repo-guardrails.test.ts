// 把 AGENTS.md 中可机械判定的仓库约定落成测试；文档只保留原则并指向此处。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
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

function assertOfficialRegistry(lock: string, content = read(lock)) {
  let count = 0;
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'resolved') {
        visit(child);
        continue;
      }
      assert.equal(typeof child, 'string', `${lock} 的 resolved 必须是地址`);
      assert.ok(URL.canParse(child as string), `${lock} 含无效 resolved 地址`);
      const url = new URL(child as string);
      assert.equal(url.protocol, 'https:', `${lock} 的 resolved 必须使用 HTTPS`);
      assert.equal(url.hostname, 'registry.npmjs.org', `${lock} 出现非官方源`);
      assert.ok(
        !url.port && !url.username && !url.password,
        `${lock} 的 resolved 含非官方端口或凭据`,
      );
      count++;
    }
  }
  visit(JSON.parse(content));
  assert.ok(count > 0, `${lock} 应含 resolved 地址`);
}

test('锁文件只引用公网官方 npm 源，不残留内网镜像', () => {
  for (const lock of ['package-lock.json', 'scripts/browser-tools/package-lock.json'])
    assertOfficialRegistry(lock);
});

test('混合官方源与非 HTTPS、非官方或损坏地址时仍拒绝，不受 JSON 排版影响', () => {
  const fixture = (resolved: unknown) =>
    JSON.stringify({
      packages: {
        '': { name: 'fixture' },
        'node_modules/official': { resolved: 'https://registry.npmjs.org/official/-/official.tgz' },
        'node_modules/changed': { resolved },
      },
    });
  assert.doesNotThrow(() =>
    assertOfficialRegistry('fixture', fixture('https://registry.npmjs.org/changed/-/changed.tgz')),
  );
  for (const resolved of [
    'http://intranet.invalid/pkg.tgz',
    'http://registry.npmjs.org/pkg.tgz',
    'https://intranet.invalid/pkg.tgz',
    'git+https://intranet.invalid/pkg.git',
    'file:../pkg.tgz',
    'https://registry.npmjs.org.intranet.invalid/pkg.tgz',
    'https://fixture-user@registry.npmjs.org/pkg.tgz',
    'https://registry.npmjs.org:8443/pkg.tgz',
    'not-a-url',
    '',
    null,
    42,
  ])
    assert.throws(() => assertOfficialRegistry('fixture', fixture(resolved)), /resolved|非官方源/);
  assert.throws(() => assertOfficialRegistry('fixture', '{"packages":{}}'), /应含 resolved/);
  assert.throws(() =>
    assertOfficialRegistry(
      'fixture',
      JSON.stringify({
        dependencies: {
          parent: { dependencies: { nested: { resolved: 'http://intranet.invalid/pkg.tgz' } } },
        },
      }),
    ),
  );
});

test('领域规则内的相对文档链接在搬迁后仍可定位', () => {
  for (const name of readdirSync(join(root, 'docs/rules')).filter((name) => name.endsWith('.md'))) {
    const path = `docs/rules/${name}`;
    for (const [, target] of read(path).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
      assert.ok(
        existsSync(resolve(root, dirname(path), target.split('#')[0])),
        `${path} 链接失效：${target}`,
      );
    }
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
