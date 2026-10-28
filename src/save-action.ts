import type { ActionShell } from './action-controller.ts';
import type { SaveData } from './progress.ts';

type SaveActionHost = Pick<
  ActionShell,
  'save' | 'game' | 'settled' | 'pendingRun' | 'saveLock' | 'writeSave' | 'toast'
>;

// false 为写入失败，null 为无变化；调用者只能在成功后切换画面或显示收获。
export function commitSaveAction(host: SaveActionHost, change: (next: SaveData) => boolean) {
  if (host.saveLock) return false;
  const next = structuredClone(host.save);
  if (!change(next)) return null;
  try {
    host.writeSave(next, host.game && !host.settled ? host.game : host.pendingRun);
  } catch {
    if (!host.saveLock) host.toast('浏览器暂时无法保存进度，请勿关闭当前页面');
    return false;
  }
  Object.assign(host.save, next);
  return true;
}
