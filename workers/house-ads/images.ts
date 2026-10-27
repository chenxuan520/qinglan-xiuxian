import { houseAdUrl, type HouseAdCampaign } from '../../src/house-ad-contract.ts';

const publicImageUrl = (value: string) => {
  if (!houseAdUrl(value)) return false;
  const host = new URL(value).hostname.toLowerCase();
  if (
    (host.includes(':') && !/^\[[23][0-9a-f]{0,3}:/i.test(host)) ||
    /(^|\.)(localhost|local|internal)$/.test(host)
  )
    return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    )
      return false;
  }
  return true;
};

// 只访问已登录、同源、结构合法的保存请求里的图片，不转发Cookie或其他凭据。
export async function validateCampaignImages(
  campaigns: HouseAdCampaign[],
  fetchImage: typeof fetch,
  timeoutMs = 8000,
): Promise<{ id: string; field: 'imageUrl' | 'mobileImageUrl' } | null> {
  const images = new Map<string, { id: string; field: 'imageUrl' | 'mobileImageUrl' }>();
  for (const ad of campaigns)
    for (const field of ['imageUrl', 'mobileImageUrl'] as const)
      if (ad[field] && !images.has(ad[field]!)) images.set(ad[field]!, { id: ad.id, field });
  if (!images.size) return null;
  const queue = [...images],
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let next = 0,
    failed: { id: string; field: 'imageUrl' | 'mobileImageUrl' } | null = null;
  async function check(address: string) {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!publicImageUrl(address)) return false;
      const response = await fetchImage(address, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'image/*', 'User-Agent': 'Qinglan-Ad-Image-Check/1.0' },
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('Location');
        if (!location) return false;
        address = new URL(location, address).href;
        continue;
      }
      if (
        !response.ok ||
        !/^image\/[a-z0-9.+-]+(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')
      ) {
        await response.body?.cancel();
        return false;
      }
      const reader = response.body?.getReader();
      if (!reader) return false;
      try {
        const first = await reader.read();
        return !first.done && first.value.byteLength > 0;
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    }
    return false;
  }
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (!failed && next < queue.length) {
          const [address, identity] = queue[next++];
          let valid = false;
          try {
            valid = await check(address);
          } catch {
            /* 网络失败或超时均拒绝保存。 */
          }
          if (!valid && !failed) {
            failed = identity;
            controller.abort();
          }
        }
      }),
    );
    return failed;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
