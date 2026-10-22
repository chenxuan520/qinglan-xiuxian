import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const PROMO_VIDEO = {
  url: 'https://075ca3ea.qinglan-xiuxian.pages.dev/qinglan-promo-30s.mp4',
  bytes: 6_137_116,
  sha256: 'dec9ad7a9ffa4233da785ed53f868402905dc9dee9eaabbd49afa2826cf96860',
};

// curl 沿用发布机的 HTTPS_PROXY；Node 22 原生 fetch 不会自动读取代理设置。
async function downloadVideo(url: string): Promise<Response> {
  const { stdout } = await promisify(execFile)(
    'curl',
    ['-sSL', '--max-time', '60', '--write-out', '\n%{http_code}', '--', url],
    { encoding: 'buffer', maxBuffer: PROMO_VIDEO.bytes + 4096 },
  );
  return new Response(stdout.subarray(0, -4), {
    status: Number(stdout.subarray(-3).toString()),
  });
}

// 视频独立于游戏构建；仅在构建、离线清单和体积校验完成后恢复。
export async function restorePromoVideo(
  outputDirectory = 'artifacts/cloudflare',
  source = PROMO_VIDEO,
  download: (url: string) => Promise<Response> = downloadVideo,
): Promise<string> {
  const response = await download(source.url);
  if (response.status !== 200) throw new Error(`视频下载失败：HTTP ${response.status}`);
  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.byteLength !== source.bytes)
    throw new Error(`视频大小不符：${contents.byteLength} / ${source.bytes}`);
  if (createHash('sha256').update(contents).digest('hex') !== source.sha256)
    throw new Error('视频 SHA-256 校验失败');

  const directory = join(resolve(outputDirectory), 'media');
  const destination = join(directory, 'qinglan-promo-30s.mp4');
  const temporary = join(directory, `.qinglan-promo-${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, contents, { flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const destination = await restorePromoVideo(process.argv[2]);
    console.log(`已恢复宣传视频：${destination}（${PROMO_VIDEO.bytes} 字节）`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
