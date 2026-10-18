// 社交分享卡片（canonical/Open Graph/Twitter）与封面文件的一致性契约。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
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
  expectMeta('property', 'og:description', '只需走位的修仙生存游戏。一世修行，叩问仙门。');
  expectMeta('property', 'og:url', 'https://xiuxian.011203.xyz/');
  expectMeta('name', 'twitter:card', 'summary_large_image');
  expectMeta('name', 'twitter:title', '叩仙门：青岚纪');
  expectMeta('name', 'twitter:description', '只需走位的修仙生存游戏。一世修行，叩问仙门。');
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
