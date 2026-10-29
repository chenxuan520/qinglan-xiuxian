import { STANDALONE } from './build-mode.ts';
import { GAME_SITE_URL } from './setting.ts';

// 本机预览只请求自己的相对接口；分发站点和单机版不请求排行榜服务。
export function leaderboardAvailable(
  origin = typeof location === 'undefined' ? '' : location.origin,
) {
  if (STANDALONE) return false;
  if (origin === new URL(GAME_SITE_URL).origin) return true;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
