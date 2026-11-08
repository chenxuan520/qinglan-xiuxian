import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { GUIDE_TABS, guideContent } from '../../src/guide/guide.ts';
import { guideCorpus, guidePlainText } from '../../src/guide/guide-corpus.ts';
import { searchGuide } from '../../src/guide/guide-search.ts';
import { lazyModulePath } from '../../src/core/module-source.ts';

test('指南语料覆盖全部标签、保持小节纯文本与1500字上限，且只生成一次', () => {
  const corpus = guideCorpus();
  assert.equal(guideCorpus(), corpus);
  assert.ok(corpus.length > GUIDE_TABS.length);
  for (const tab of GUIDE_TABS) {
    const sections = corpus.filter((section) => section.tab === tab.id);
    assert.ok(sections.length, tab.id);
    for (const section of sections) {
      assert.equal(section.tabName, tab.title);
      assert.ok(
        section.heading.length > 0 && section.text.length > 0 && section.text.length <= 1500,
      );
      assert.doesNotMatch(section.text, /<[^>]+>|\s{2,}/);
      assert.ok(guidePlainText(guideContent(tab.id)).includes(section.text));
    }
  }
  for (const section of corpus)
    assert.doesNotMatch(
      section.heading + section.text,
      /青竹蜂云剑|金雷入剑|如意随风|魂木生息|梵音护体|佛光护体|佛光挡劫|风雷相生|身法更疾|玉书落墨|判笔添字|灵泉入盏|血池回春/,
    );
});

test('去除HTML保留按键文字和实体，不把脚本或样式当正文', () => {
  assert.equal(
    guidePlainText(
      '<p>按 <kbd>E</kbd> &amp; &#65; &#x42;</p><script>secret()</script><style>.x{}</style>',
    ),
    '按 E & A B',
  );
});

test('指南及答疑重试只取对应分块，不被同前缀模块抢先匹配', async () => {
  const resources = [
    { path: 'assets/guide-content-aBcD_123.js' },
    { path: 'assets/guide-ask-client-_23efGHi.js' },
    { path: 'assets/guide-ask-Q1w2e3r4.js' },
    { path: 'assets/guide-z9y8x7w6.js' },
  ];
  assert.equal(lazyModulePath(resources, 'guide'), 'assets/guide-z9y8x7w6.js');
  assert.equal(lazyModulePath(resources, 'guide-ask'), 'assets/guide-ask-Q1w2e3r4.js');
  assert.equal(
    lazyModulePath(resources, 'guide-ask-client'),
    'assets/guide-ask-client-_23efGHi.js',
  );
  assert.equal(lazyModulePath(resources, 'missing'), undefined);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
  const names = new Set<string>();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'retryModule'
      ) {
        assert.ok(ts.isStringLiteral(node.arguments[0]));
        names.add(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.equal(names.size, 14);
  const filename = join(root, 'src/core/module-source.ts');
  const source = ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const retry = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'retryModule',
  );
  assert.ok(retry);
  const code = stripTypeScriptTypes(retry.getText(source), { mode: 'transform' })
    .replace(/^export /, '')
    .replaceAll('import.meta.env', 'env')
    .replace(/return import\([^;]*url\.href\);/, 'return url.href;');
  assert.doesNotMatch(code, /\bimport\s*\(/, '仅拦截模块导入，执行真实重试地址计算');
  const build = 'a'.repeat(24);
  const manifest = {
    build,
    resources: [...names].map((name) => ({ path: `assets/${name}-1234abcd.js` })),
  };
  for (const dev of [true, false])
    for (const base of ['/', '/qinglan-xiuxian/']) {
      let fetches = 0;
      const retryPath = runInNewContext(code + '\nretryModule', {
        URL,
        location: { href: 'https://game.test' + base },
        env: { BASE_URL: base, DEV: dev },
        __QINGLAN_BUILD_ID__: build,
        lazyModulePath,
        fetch: async () => {
          fetches++;
          return { ok: true, json: async () => manifest };
        },
      });
      for (const name of names) {
        const targets = files.filter((file) => basename(file) === `${name}.ts`);
        assert.equal(targets.length, 1, name);
        const path = dev
          ? relative(root, targets[0]).split('\\').join('/')
          : `assets/${name}-1234abcd.js`;
        assert.equal(
          await retryPath(name, 'probe', 2),
          new URL(path, 'https://game.test' + base).href + '#probe-retry-2',
        );
      }
      assert.equal(fetches, dev ? 0 : names.size);
    }
});

test('指定问题首条命中指南的实际小节，无关问题不检索', () => {
  const corpus = guideCorpus();
  for (const [question, tab, heading] of [
    ['丹药什么时候能吃', 'medicine', '行前一炉丹香'],
    ['怎么换设备', 'basics', '进度如何保存，怎样换设备'],
    ['灵根有什么区别', 'roots', '资质与五行加持'],
    ['排行榜怎么上', 'cultivation', '仙途履历与灵威'],
  ]) {
    const found = searchGuide(question, corpus);
    assert.equal(found[0].tab, tab, question);
    assert.equal(found[0].heading, heading, question);
    assert.ok(
      found.length <= 3 && found.reduce((total, section) => total + section.text.length, 0) <= 4000,
    );
  }
  assert.match(searchGuide('排行榜怎么上', corpus)[0].text, /万魂幡/);
  assert.deepEqual(searchGuide('今天天气怎么样', corpus), []);
  assert.deepEqual(searchGuide('', corpus), []);
});

test('标题三倍计分、中英文及数字匹配，同义说法和4000字截断保持顺序', () => {
  const make = (heading: string, text: string) => ({
    tab: 'basics',
    tabName: '怎么玩',
    heading,
    text,
  });
  const titles = [make('其他', '灵石 灵石'), make('灵石', '其他')];
  assert.equal(searchGuide('钱', titles)[0].heading, '灵石');
  assert.equal(searchGuide('FPS 60', [make('性能', 'FPS 60 帧')])[0].heading, '性能');
  for (const [word, canonical] of [
    ['药', '丹药'],
    ['装备', '法宝'],
    ['技能', '功法'],
    ['门派', '宗门'],
    ['重开', '轮回'],
    ['换设备', '存档'],
    ['寿命', '寿元'],
    ['升级', '境界'],
    ['排名', '万魂幡'],
    ['渡劫', '天劫'],
    ['拍卖行', '坊市'],
    ['宝物', '奇物'],
  ])
    assert.equal(searchGuide(word, [make(canonical, canonical)])[0].heading, canonical);
  const long = [
    make('一', '法宝'.repeat(750)),
    make('二', '法宝'.repeat(750)),
    make('三', '法宝'.repeat(750)),
    make('四', '法宝'.repeat(750)),
  ];
  const found = searchGuide('法宝', long);
  assert.deepEqual(
    found.map((section) => section.heading),
    ['一', '二', '三'],
  );
  assert.deepEqual(
    found.map((section) => section.text.length),
    [1500, 1500, 1000],
  );
  assert.equal(long[2].text.length, 1500, '截断不污染缓存');
  assert.equal(searchGuide('法宝', long, 1).length, 1);
  assert.deepEqual(searchGuide('法宝', long, 0), []);
});
