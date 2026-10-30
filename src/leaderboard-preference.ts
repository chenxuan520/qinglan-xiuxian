import { TAMPERED_LEADERBOARD_MESSAGE } from './leaderboard-integrity.ts';

export const LEADERBOARD_PREFERENCE_KEY = 'qinglan-leaderboard-v1';

// 排行榜是独立的本机偏好，不进入人物存档。
export class LeaderboardPreference {
  private value = true;
  private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage) {
    this.storage = storage;
    try {
      this.value = storage().getItem(LEADERBOARD_PREFERENCE_KEY) !== '0';
    } catch {
      this.value = false;
    }
  }
  get enabled() {
    return this.value;
  }
  toggle() {
    const next = !this.value;
    try {
      this.storage().setItem(LEADERBOARD_PREFERENCE_KEY, next ? '1' : '0');
    } catch {
      return false;
    }
    this.value = next;
    return true;
  }
}

export function leaderboardSettings(enabled: boolean, tampered = false) {
  return `<section class="settings-display"><div class="settings-section-heading"><h3>万魂幡</h3><button class="secondary-button" data-action="leaderboard-toggle" aria-label="排行榜" aria-pressed="${enabled}">${enabled ? '关闭' : '开启'}</button></div><p>此世落幕或完成终章后可留名。关闭后不查询、不提醒、不上传。</p>${tampered ? `<p class="panel-note">${TAMPERED_LEADERBOARD_MESSAGE}</p>` : ''}<a class="secondary-button leaderboard-settings-link" href="https://xiuxian.011203.xyz/leaderboard/" target="_blank" rel="noopener">查看万魂幡 ↗</a></section>`;
}
