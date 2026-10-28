import type { SaveData } from './progress.ts';
import { offlinePanel } from './offline.ts';
import { AUTOPLAY_BUILDS } from './autoplay-build.ts';
import { TREASURES } from './data.ts';

export function autoplayBuildContent(save: SaveData) {
  const build = save.autoplayBuild;
  const current = AUTOPLAY_BUILDS.find((mode) => mode.id === build.mode)!;
  return `<label class="settings-build-field">培养倾向<select id="autoplay-build-mode" aria-label="自动历练培养倾向">${AUTOPLAY_BUILDS.map((mode) => `<option value="${mode.id}" ${mode.id === build.mode ? 'selected' : ''}>${mode.name}</option>`).join('')}</select></label><p>${current.description}</p>${
    build.mode === 'custom'
      ? `<div class="settings-build-targets">${build.targets
          .map(
            (id, slot) =>
              `<label class="settings-build-field">法宝${slot === 0 ? '一' : '二'}<select id="autoplay-build-target-${slot}" aria-label="优先培养的第${slot === 0 ? '一' : '二'}件法宝"><option value="">不指定</option>${(
                ['orthodox', 'demonic'] as const
              )
                .map(
                  (school) =>
                    `<optgroup label="${school === 'orthodox' ? '正道' : '魔道'}法宝">${TREASURES.filter(
                      (t) => t.school === school,
                    )
                      .map(
                        (t) =>
                          `<option value="${t.id}" ${t.id === id ? 'selected' : ''}>${t.name}</option>`,
                      )
                      .join('')}</optgroup>`,
                )
                .join('')}</select></label>`,
          )
          .join(
            '',
          )}</div><p>${build.targets.some(Boolean) ? '目标须符合本局路线。' : '尚未指定法宝，暂按默认路线选择。'}</p>`
      : ''
  }<p class="panel-note">只影响自动选技。设置随存档与轮回保留。</p>`;
}

export function settingsSoundNote(save: Pick<SaveData, 'sound' | 'volume'>) {
  if (!save.sound) return '当前静音，可先调整音量，再开启声音。';
  if (save.volume === 0) return '音量为零，调高后恢复播放。';
  return '音乐与音效共用此音量，调整后自动保存。';
}

export function settingsContent(save: SaveData) {
  return `<div class="settings-copy"><div class="save-record"><div class="save-record-copy"><h3>此世存档</h3><p>把这一世的修为与旧事收进行囊。普通模式可续未尽历练；极限未完战斗重开将身陨。</p><small>导出存档文件，换设备也能接续这一世。</small></div><div class="save-actions"><button class="secondary-button" data-action="export-save">导出此世</button><button class="secondary-button" data-action="import-save">导入旧档</button><input id="save-import" type="file" accept=".json,application/json" hidden></div></div><section class="settings-autoplay" aria-labelledby="settings-autoplay-title"><div class="settings-section-heading"><h3 id="settings-autoplay-title">自动历练</h3><button class="secondary-button" data-action="autoplay" aria-label="自动历练" aria-pressed="${save.autoplay}">${save.autoplay ? '关闭' : '开启'}</button></div><p>开启后进入历练会自动走位、拾取与选择机缘；战斗中可随时切回手动。手机浏览器支持时，前台自动历练保持屏幕常亮，暂停或切到后台时解除。</p><div id="settings-autoplay-build">${autoplayBuildContent(save)}</div></section><section id="screen" hidden></section><section class="settings-sound" aria-labelledby="settings-sound-title"><div class="settings-section-heading"><h3 id="settings-sound-title">音乐与音效</h3><button class="secondary-button" data-action="settings-sound" aria-pressed="${save.sound}">${save.sound ? '关闭声音' : '开启声音'}</button></div><label class="settings-volume">音量 <output>${Math.round(save.volume * 100)}%</output><input type="range" min="0" max="100" value="${Math.round(save.volume * 100)}" data-volume aria-label="音乐与音效音量" /></label><p data-settings-sound-note>${settingsSoundNote(save)}</p></section><details class="disclosure settings-section" data-disclosure="offline"><summary><span>离线资源</span><small data-offline-summary>按需缓存，断网游玩</small></summary>${offlinePanel()}</details></div>`;
}
