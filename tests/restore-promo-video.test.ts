import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { restorePromoVideo } from '../scripts/restore-promo-video.ts';

const contents = Buffer.from('verified video fixture');
const source = {
  url: 'https://video.test/promo.mp4',
  bytes: contents.length,
  sha256: createHash('sha256').update(contents).digest('hex'),
};
const validDownload = async (url: string) => {
  assert.equal(url, source.url);
  return new Response(contents);
};

test('宣传视频验证通过后写入 media，替换旧文件且不改游戏清单', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'qinglan-promo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const media = join(directory, 'media');
  await mkdir(media);
  await writeFile(join(directory, 'offline.json'), 'unchanged manifest');
  await writeFile(join(media, 'qinglan-promo-30s.mp4'), 'old video');
  const destination = await restorePromoVideo(directory, source, validDownload);
  assert.equal(destination, join(media, 'qinglan-promo-30s.mp4'));
  assert.deepEqual(await readFile(destination), contents);
  assert.deepEqual(await readdir(media), ['qinglan-promo-30s.mp4']);
  assert.equal(await readFile(join(directory, 'offline.json'), 'utf8'), 'unchanged manifest');
});

for (const [label, download, message] of [
  ['HTTP 失败', async () => new Response('unavailable', { status: 503 }), /HTTP 503/],
  ['分段响应', async () => new Response(contents, { status: 206 }), /HTTP 206/],
  ['长度错误', async () => new Response('truncated'), /大小不符/],
  ['SHA 错误', async () => new Response(Buffer.alloc(contents.length)), /SHA-256/],
  [
    '网络失败',
    async () => {
      throw new Error('network unavailable');
    },
    /network unavailable/,
  ],
  [
    '读取中断',
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('connection interrupted'));
          },
        }),
      ),
    /connection interrupted/,
  ],
] as const) {
  test(`宣传视频${label}时保留已有视频，且不留下临时文件`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'qinglan-promo-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const media = join(directory, 'media');
    await mkdir(media);
    await writeFile(join(media, 'qinglan-promo-30s.mp4'), 'old video');
    await assert.rejects(restorePromoVideo(directory, source, download), message);
    assert.equal(await readFile(join(media, 'qinglan-promo-30s.mp4'), 'utf8'), 'old video');
    assert.deepEqual(await readdir(media), ['qinglan-promo-30s.mp4']);
  });
}

test('宣传视频原子替换失败时清除临时文件并保留原目标', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'qinglan-promo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const media = join(directory, 'media');
  const destination = join(media, 'qinglan-promo-30s.mp4');
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'sentinel'), 'keep');
  await assert.rejects(restorePromoVideo(directory, source, validDownload), /EISDIR/);
  assert.equal(await readFile(join(destination, 'sentinel'), 'utf8'), 'keep');
  assert.deepEqual(await readdir(media), ['qinglan-promo-30s.mp4']);
});
