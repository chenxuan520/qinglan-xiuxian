import type { Game } from './game.ts';
import type { SaveData } from './progress.ts';
import { realmInfo, lifespanInfo } from './progress.ts';
import {
  DIFFICULTIES,
  FINAL_TRIAL_STAGE,
  MAX_RUN_LEVEL,
  STAGES,
  STAGE_YEARS_PER_MINUTE,
  enemyWave,
  formatTime,
  passive,
  pathInfo,
  treasure,
  xpNeeded,
} from './data.ts';
import { activeMedicines } from './medicine-data.ts';
import { formatNumber } from './number-format.ts';
import { controls } from './common-ui.ts';
import { icon } from './icons.ts';
import type { MobileDisplay } from './mobile-display.ts';

export class BattleHud {
  private lastLoadout = '';
  private readonly ui: HTMLDivElement;
  private readonly save: SaveData;
  private readonly mobileDisplay: MobileDisplay;
  constructor(ui: HTMLDivElement, save: SaveData, mobileDisplay: MobileDisplay) {
    this.ui = ui;
    this.save = save;
    this.mobileDisplay = mobileDisplay;
  }
  reset() {
    this.lastLoadout = '';
  }
  render(game: Game, volumeOpen: boolean, touchHintDismissed: boolean) {
    const { ui, save, mobileDisplay } = this;

    document.body.classList.remove('immortal-home');
    this.lastLoadout = '';
    document.body.classList.add('in-game');
    ui.innerHTML = `<div class="game-hud"><div class="player-panel"><div class="player-heading"><span id="realm-name">${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name}</span><b id="level" title="局内等级：收集灵气升级，选择法宝与功法">LV. 1</b></div><div class="health-label"><span>气血</span><span id="health-text">100 / 100</span></div><div class="health-bar"><i id="health-fill"></i></div><div class="cultivation-label"><span id="cultivation-text"></span><span>实时修为</span></div><div id="lifespan-text" class="lifespan-hud"></div><small id="medicine-hud"></small></div><div class="stage-timer"><div>${game.encounterName} · ${pathInfo(game.path).name}<i>·</i>${DIFFICULTIES[game.difficulty].name}</div><strong id="time">00:00</strong><span> / ${game.tribulation ? '渡劫中' : formatTime(game.stageDuration)}</span><small id="wave-label">初入秘境 · 稳固道心</small></div><div class="combat-actions"><span class="kill-counter">斩妖 <b id="kills">0</b></span>${controls(save, volumeOpen, mobileDisplay, true)}</div></div><div id="boss-bar" class="boss-bar" hidden><div><span>${STAGES[game.stage].boss}</span><small>妖王</small></div><div class="health-bar"><i></i></div></div><div id="notice" class="battle-notice"></div><div id="cache-prompt" class="cache-prompt" hidden><small id="cache-status"></small></div><p class="touch-movement-hint"${touchHintDismissed || save.autoplay ? ' hidden' : ''}>按住空白处拖动 · 法宝自动攻击</p><div class="battle-bottom"><div class="battle-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键</span><small><kbd>E</kbd> 开启自动历练 · 触屏拖动 · 自动施法</small></div><div class="equipped-slots" id="equipped-slots"></div><div class="battle-objective"><span id="xp-text">灵气 0 / 20</span><small>${game.tribulation ? '避开劫雷 · 反击核心' : game.isFinalTrial ? '全员精英 · 决战仙尊' : '存活历练 · 斩灭妖王'}</small></div></div><div class="passive-slots" id="passive-slots"></div><div class="xp-track"><i id="xp-fill"></i></div>`;
    this.update(game);
  }
  update(game: Game) {
    const { ui, save } = this;

    const set = (id: string, text: string, html = false) => {
      const el = document.getElementById(id);
      const content = html ? 'innerHTML' : 'textContent';
      if (el && el[content] !== text) el[content] = text;
    };
    const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
    set('realm-name', realm.name);
    set(
      'cultivation-text',
      realm.max
        ? '真仙 · 长生久视'
        : realm.locked
          ? '通关第七境成仙'
          : `${realm.progress} / ${realm.needed}`,
    );
    set('level', `LV. ${game.level}`);
    const cachePrompt = document.getElementById('cache-prompt');
    if (cachePrompt) {
      const c = game.cacheChallenge;
      const shown = !!c && ['offered', 'active'].includes(c.phase) && game.state === 'playing';
      cachePrompt.hidden = !shown;
      if (shown && c) {
        const dx = c.x - game.player.x,
          dy = c.y - game.player.y;
        const direction = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][
          (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8
        ];
        set(
          'cache-status',
          c.phase === 'active'
            ? `守匣挑战 · 剩余 ${Math.max(0, Math.ceil(c.deadline - game.time))} 秒`
            : game.cacheNearby
              ? game.enemies.filter((e) => !e.dead && e.elite && !e.boss).length > 2
                ? '附近精英过多 · 清理后自动开阵'
                : `正在开阵 · ${Math.round(game.cacheApproachProgress * 100)}%`
              : `守匣灵阵 ${direction} ${Math.round(Math.hypot(dx, dy))} 步 · 入阵停留自动挑战`,
        );
      }
    }
    set(
      'medicine-hud',
      activeMedicines(save.medicine, save.age)
        .map(
          (m) =>
            `<span>${m.name} ${Math.max(0, save.medicine.active[m.id] - save.age).toFixed(0)}年</span>`,
        )
        .join(' '),
      true,
    );
    const life = lifespanInfo(save);
    set(
      'lifespan-text',
      `年岁 ${life.age.toFixed(1)} / ${Number.isFinite(life.limit) ? life.limit : '∞'} · ${game.tribulation ? '渡劫暂停计龄' : `${STAGE_YEARS_PER_MINUTE[game.stage]}年/分`}`,
    );
    document
      .getElementById('lifespan-text')
      ?.classList.toggle(
        'urgent',
        life.remaining <= life.limit * 0.15 && Number.isFinite(life.limit),
      );
    set(
      'health-text',
      `${formatNumber(Math.ceil(game.player.hp))} / ${formatNumber(game.player.maxHp)}`,
    );
    document.querySelector<HTMLElement>('#health-fill')!.style.width =
      `${Math.max(0, game.player.hp / game.player.maxHp) * 100}%`;
    document.querySelector('.player-panel')?.classList.toggle('low-health', game.lowHealth > 0);
    set('kills', `${game.kills}`);
    set('time', formatTime(game.time));
    const maxLevel = game.level >= MAX_RUN_LEVEL;
    set(
      'xp-text',
      game.tribulation
        ? '走位渡劫 · 不掉落灵气'
        : maxLevel
          ? `已满级 · LV. ${MAX_RUN_LEVEL}`
          : `灵气 ${Math.floor(game.xp)} / ${xpNeeded(game.level)}`,
    );
    document.querySelector<HTMLElement>('#xp-fill')!.style.width =
      `${maxLevel ? 100 : Math.min(100, (game.xp / xpNeeded(game.level)) * 100)}%`;
    set(
      'wave-label',
      game.tribulation
        ? game.tribulationVulnerable
          ? '核心显露 · 集中输出'
          : '劫雷蓄势 · 留意预警'
        : game.isFinalTrial
          ? `七劫试炼 · 已破 ${game.trialBossesDefeated} / 7 劫 · 妖潮 ${enemyWave(game.stage, game.time) + 1} / 4`
          : game.bossSpawned
            ? '妖王现身 · 决战之时'
            : [
                '初入秘境 · 稳固道心',
                '第二批妖物 · 突袭来袭',
                '第三批妖物 · 强敌压境',
                '最后一批 · 妖潮汹涌',
              ][enemyWave(game.stage, game.time)],
    );
    const notice = document.getElementById('notice')!;
    const showNotice = game.noticeTime > 0 && !game.notice.includes('降临');
    notice.textContent = showNotice ? game.notice : '';
    notice.classList.toggle('visible', showNotice);
    const aliveBosses = game.enemies.filter((e) => e.boss && !e.dead);
    const bossBar = document.querySelector<HTMLElement>('#boss-bar')!;
    bossBar.hidden = !game.boss;
    if (game.boss) {
      bossBar.querySelector<HTMLElement>('span')!.textContent =
        (game.tribulation
          ? `天劫 · 第 ${game.tribulation} 劫`
          : STAGES[game.boss.bossStage ?? game.stage].boss) +
        (aliveBosses.length > 1 ? ` · 同场 ${aliveBosses.length} 位妖王` : '');
      bossBar.querySelector<HTMLElement>('i')!.style.width =
        `${(game.boss.hp / game.boss.maxHp) * 100}%`;
    }
    const loadout = JSON.stringify([
      game.weapons.map((w) => [w.id, w.level, w.evolved]),
      game.passives,
    ]);
    if (loadout !== this.lastLoadout) {
      this.lastLoadout = loadout;
      document.getElementById('equipped-slots')!.innerHTML = Array.from({ length: 6 }, (_, i) => {
        const w = game!.weapons[i];
        if (!w)
          return '<div class="equipped-slot empty"><span>＋</span><small>待悟法宝</small></div>';
        const t = treasure(w.id);
        return `<div class="equipped-slot ${w.evolved ? 'evolved' : ''}" title="${t.desc}">${icon(t.id, t.color)}<div><strong>${w.evolved ? t.evolution : t.name}</strong><span>${w.evolved ? '仙器 · 觉醒' : `${['', '一', '二', '三', '四', '五', '六'][w.level]}重`}<i>${'·'.repeat(w.level)}</i></span></div></div>`;
      }).join('');
      document.getElementById('passive-slots')!.innerHTML = Object.entries(game.passives)
        .map(
          ([id, level]) =>
            `<span title="${passive(id).desc}">${icon(id, passive(id).color)}${passive(id).name}<b>${level}</b></span>`,
        )
        .join('');
    }
    const timer = ui.querySelector<HTMLElement>('.stage-timer')!;
    ui.style.setProperty(
      '--battle-timer-bottom',
      `${Math.ceil(timer.getBoundingClientRect().bottom)}px`,
    );
    ui.style.setProperty(
      '--battle-info-bottom',
      `${Math.ceil((bossBar.hidden ? timer : bossBar).getBoundingClientRect().bottom)}px`,
    );
  }
}
