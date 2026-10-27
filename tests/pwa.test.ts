import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

function pngSize(path: string) {
  const file = readFileSync(new URL(path, root));
  assert.equal(file.subarray(1, 4).toString('ascii'), 'PNG', path);
  assert.equal(file.subarray(12, 16).toString('ascii'), 'IHDR', path);
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

test('Web App Manifest 声明可安装信息，图标存在且尺寸一致', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name, '叩仙门：青岚纪');
  assert.ok(manifest.short_name);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '.');
  assert.equal(manifest.lang, 'zh-CN');
  assert.ok(manifest.theme_color && manifest.background_color);
  const sizes = new Set<string>();
  for (const icon of manifest.icons) {
    const target = `public/${icon.src}`;
    assert.ok(existsSync(new URL(target, root)), target);
    const { width, height } = pngSize(target);
    assert.equal(icon.sizes, `${width}x${height}`, icon.src);
    assert.equal(icon.type, 'image/png');
    assert.ok(width >= 192 && width === height, icon.src);
    sizes.add(icon.sizes);
  }
  assert.ok(sizes.has('192x192') && sizes.has('512x512'), 'manifest 需要 192 与 512 图标');
  assert.ok(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable'));
});

test('入口页通过构建基准路径引用 manifest、图标与主屏幕能力', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="%BASE_URL%manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="%BASE_URL%icons\/apple-touch-icon\.png"/);
  assert.match(html, /rel="icon" href="%BASE_URL%favicon\.svg"/);
  assert.match(html, /name="mobile-web-app-capable"/);
  const { width, height } = pngSize('public/icons/apple-touch-icon.png');
  assert.equal(width, 180);
  assert.equal(height, 180);
});
