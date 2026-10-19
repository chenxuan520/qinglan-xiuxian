import { GAME_SITE_URL } from './setting.ts';
import type { createTelemetry } from './telemetry.ts';

export const JOURNEY_SHARE_URL = `${GAME_SITE_URL}?from=journey-card`;
export const SHARING_ACTIONS = {
  preview: '留影生成',
  'save-request': '请求保存图片',
  'save-failed': '发起保存失败',
  'share-request': '点击分享',
  shared: '系统分享完成',
  cancelled: '取消系统分享',
  fallback: '分享转为保存',
  'qr-arrival': '二维码进入',
} as const;
export type SharingAction = keyof typeof SHARING_ACTIONS;

export function recordSharingArrival(
  telemetry: Pick<ReturnType<typeof createTelemetry>, 'track'>,
  href: string,
  fresh: boolean,
  replace: (url: string) => void,
) {
  const url = new URL(href);
  if (
    url.searchParams.getAll('from').length !== 1 ||
    url.searchParams.get('from') !== 'journey-card'
  )
    return false;
  telemetry.track({ type: 'sharing', detail: 'qr-arrival', fresh });
  url.searchParams.delete('from');
  try {
    replace(url.href);
  } catch {
    // 来源标记清理失败不影响游戏；不修改其它参数、锚点或存档。
  }
  return true;
}
