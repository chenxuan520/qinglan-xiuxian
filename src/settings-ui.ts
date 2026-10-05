import type { SaveData } from './progress.ts';
import { offlinePanel } from './offline.ts';

export function settingsSoundNote(save: Pick<SaveData, 'sound' | 'volume'>) {
  if (!save.sound) return '当前静音，可先调整音量，再开启声音。';
  if (save.volume === 0) return '音量为零，调高后恢复播放。';
  return '音乐与音效共用此音量，调整后自动保存。';
}

export function settingsContent(save: SaveData) {
  return `<div class="settings-copy"><section class="settings-sound" aria-labelledby="settings-sound-title"><div class="settings-section-heading"><h3 id="settings-sound-title">音乐与音效</h3><button class="secondary-button" data-action="settings-sound" aria-pressed="${save.sound}">${save.sound ? '关闭声音' : '开启声音'}</button></div><label class="settings-volume">音量 <output>${Math.round(save.volume * 100)}%</output><input type="range" min="0" max="100" value="${Math.round(save.volume * 100)}" data-volume aria-label="音乐与音效音量" /></label><p data-settings-sound-note>${settingsSoundNote(save)}</p></section><details class="disclosure settings-section" data-disclosure="offline"><summary><span>离线资源</span><small data-offline-summary>按需缓存，断网游玩</small></summary>${offlinePanel()}</details></div>`;
}
