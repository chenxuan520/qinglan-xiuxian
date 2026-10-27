// 社交分享卡片（canonical/Open Graph/Twitter）与封面文件的一致性契约。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { lobbyView } from '../src/lobby-ui.ts';
import { freshSave } from '../src/progress.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const title = '叩仙门：青岚纪';
const slogan = '一世修行，叩问仙门';
const description =
  '一世修行，叩问仙门。在秘境与人间修行，见岁月流转、故人离合；叩入仙门后，可留一物传承，让后来人接续问道。';
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 校验存在一条 <meta>，其同一标签内某属性等于 key、content 等于 value；容忍 prettier 拆行。
function expectMeta(kind: 'property' | 'name', key: string, value: string) {
  const pattern = new RegExp(
    `<meta[^>]*${kind}="${escapeRe(key)}"[^>]*content="${escapeRe(value)}"[^>]*>`,
    's',
  );
  assert.ok(pattern.test(html), `${kind}="${key}" 缺失或内容不一致`);
}

function jpegSize(path: string) {
  const file = readFileSync(new URL(path, root));
  assert.equal(file.readUInt16BE(0), 0xffd8, `${path} 不是 JPEG`);
  let offset = 2;
  while (offset < file.length) {
    assert.equal(file[offset], 0xff, `${path} 段结构损坏`);
    const marker = file[offset + 1];
    const length = file.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc2)
      return { width: file.readUInt16BE(offset + 7), height: file.readUInt16BE(offset + 5) };
    offset += 2 + length;
  }
  throw new Error(`未找到尺寸段：${path}`);
}

test('入口页声明 canonical 与 Open Graph / Twitter 分享卡片', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/xiuxian\.011203\.xyz\/"/);
  expectMeta('property', 'og:type', 'website');
  expectMeta('property', 'og:locale', 'zh_CN');
  expectMeta('property', 'og:site_name', '叩仙门：青岚纪');
  expectMeta('property', 'og:title', '叩仙门：青岚纪');
  expectMeta('name', 'description', `${title}｜${description}`);
  expectMeta('property', 'og:description', description);
  expectMeta('property', 'og:url', 'https://xiuxian.011203.xyz/');
  expectMeta('name', 'twitter:card', 'summary_large_image');
  expectMeta('name', 'twitter:title', '叩仙门：青岚纪');
  expectMeta('name', 'twitter:description', description);
});

test('首页保留启程原文，README与安装信息仍遵守现有名称和宣传语', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name, title);
  assert.equal(manifest.short_name, '叩仙门');
  assert.equal(manifest.description, description);
  expectMeta('name', 'apple-mobile-web-app-title', manifest.short_name);
  const readme = read('README.md');
  assert.ok(readme.startsWith(`# ${title}\n`));
  assert.ok(readme.includes(slogan));
  assert.match(readme, /叩入仙门后，可从法宝、丹药或奇物中留下一物/);
  assert.match(readme, /也可只留一句指引/);
  for (const lifeMode of ['normal', 'extreme'] as const) {
    const save = freshSave();
    save.lifeMode = lifeMode;
    const home = lobbyView(
      save,
      0,
      0,
      false,
      { available: false, active: false },
      null,
      true,
      true,
      false,
    );
    assert.ok(home.includes(`aria-label="${title}"`));
    assert.ok(home.includes(slogan));
    assert.match(home, /在青岚镇长大，十五岁踏上仙途。<br>为觅长生，为追寻大道，向山海深处去。/);
    assert.doesNotMatch(home, /叩入仙门后可留一物传承/);
    assert.doesNotMatch(home, /御剑问长生|青岚入仙途|青岚仙途/);
  }
});

test('og:image 指向官网绝对地址，封面文件存在、JPEG、1200x630', () => {
  const og = html.match(/property="og:image"[^>]*content="([^"]+)"/s);
  assert.ok(og, '缺少 og:image');
  assert.equal(og![1], 'https://xiuxian.011203.xyz/assets/og-cover.jpg');
  const twitter = html.match(/name="twitter:image"[^>]*content="([^"]+)"/s);
  assert.equal(twitter![1], og![1]);
  assert.ok(existsSync(new URL('public/assets/og-cover.jpg', root)));
  const { width, height } = jpegSize('public/assets/og-cover.jpg');
  assert.equal(width, 1200);
  assert.equal(height, 630);
  expectMeta('property', 'og:image:width', '1200');
  expectMeta('property', 'og:image:height', '630');
  assert.ok(
    /property="og:image:alt"[^>]*content="[^"]+[^"]*"[^>]*>/s.test(html),
    '缺少 og:image:alt',
  );
});
