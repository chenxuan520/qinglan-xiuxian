// 静态首页契约：脚本加载前与禁用 JavaScript 时，入口页本身即是完整内容页。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

test('入口页含静态首页：主标题、玩法介绍与隐私说明区块', () => {
  const app = html.match(/<div id="app">([\s\S]*?)<\/div>\s*<script/);
  assert.ok(app, '#app 内应有静态内容');
  const body = app[1];
  assert.match(body, /<h1>[\s\S]*叩仙门[\s\S]*青岚纪[\s\S]*<\/h1>/);
  assert.match(body, /只需走位/);
  assert.match(body, /<h2 id="privacy">/);
  assert.match(body, /浏览器本地/, '隐私说明应提及本地存档');
  assert.match(body, /Cookie/, '隐私说明应披露广告 Cookie');
});

test('静态首页对爬虫可读：剥离标签后正文不少于三百字', () => {
  const app = html.match(/<div id="app">([\s\S]*?)<\/div>\s*<script/);
  assert.ok(app);
  const text = app[1]
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
  assert.ok(text.length >= 300, `静态正文仅 ${text.length} 字，不足以作为审核内容页（应 ≥300）`);
});

test('静态首页自带内联样式与 noscript 提示，不依赖构建产物', () => {
  assert.match(html, /<style>[\s\S]*\.static-home[\s\S]*<\/style>/);
  assert.match(html, /<noscript>/);
  assert.match(html, /%BASE_URL%assets\/og-cover\.jpg/, '主视觉应随部署基础路径');
});

test('robots.txt 允许抓取并指向官网 sitemap', () => {
  const robots = readFileSync(new URL('public/robots.txt', root), 'utf8');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/xiuxian\.011203\.xyz\/sitemap\.xml/);
});

test('sitemap.xml 存在且只声明唯一官网入口', () => {
  assert.ok(existsSync(new URL('public/sitemap.xml', root)));
  const sitemap = readFileSync(new URL('public/sitemap.xml', root), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)];
  assert.deepEqual(
    locs.map((m) => m[1]),
    ['https://xiuxian.011203.xyz/'],
  );
});
