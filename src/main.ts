import './style.css';
import {
  TREASURES,
  PASSIVES,
  STAGES,
  DIFFICULTIES,
  REALMS,
  ENEMIES,
  treasure,
  passive,
  xpNeeded,
  formatTime,
} from './data.ts';
import {
  parseSave,
  SAVE_KEY,
  realmInfo,
  trainingCost,
  forgeCost,
  train,
  forge,
  settleRun,
} from './progress.ts';
import { Game } from './game.ts';
import { autoplayChoice, autoplayInput } from './autoplay.ts';
import type { Choice } from './game.ts';
import { Renderer } from './render.ts';
import { icon, smallIcon } from './icons.ts';
import { GUIDE_TABS, guideContent } from './guide.ts';
import { spriteStyle } from './sprites.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="world" aria-label="修仙战斗场景"></canvas><div class="screen-grain"></div><div id="ui"></div><div id="modal-root"></div><div id="joystick"><span></span></div><div id="toast" role="status"></div>`;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#world')!);
let storageAvailable = true;
let raw: string | null = null;
try {
  raw = localStorage.getItem(SAVE_KEY);
} catch {
  storageAvailable = false;
}
const save = parseSave(raw);
let pendingRun: Game | null = null;
try {
  pendingRun = Game.restore(save, JSON.parse(raw || '{}').activeRun);
} catch {
  /* 无有效对局时仍保留永久进度。 */
}
let selectedStage = save.unlocked,
  difficulty = 0,
  game: Game | null = null;
let panel = '',
  bookTab = 'treasures',
  selectedTreasure = save.starter,
  settled = false;
let guideTab = 'basics';
let rewards: ReturnType<typeof settleRun> | null = null,
  oldRealm = '',
  abandonConfirm = false;
const keys = new Set<string>();
let touchInput = { x: 0, y: 0 },
  pointer: number | null = null,
  touchOrigin = { x: 0, y: 0 };
let audio: AudioContext | null = null,
  lastSound = 0,
  assetsReady = false;
function persist() {
  const active = game && !settled ? game : pendingRun;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...save, activeRun: active?.snapshot() ?? null }),
    );
  } catch {
    if (storageAvailable) toast('浏览器暂时无法保存进度，请勿关闭当前页面');
    storageAvailable = false;
  }
}
function toast(text: string) {
  const el = document.querySelector<HTMLDivElement>('#toast')!;
  el.textContent = text;
  el.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), 3200);
}
let toastTimer = 0;
function sound(name: string) {
  if (!save.sound || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  if ((name === 'cast' && now - lastSound < 0.3) || now - lastSound < 0.035) return;
  lastSound = now;
  const notes: Record<string, number> = {
    cast: 440,
    hurt: 110,
    upgrade: 660,
    breakthrough: 784,
    select: 880,
    lightning: 160,
    boss: 98,
    win: 1046,
    lose: 147,
  };
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = name === 'hurt' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(notes[name] || 523, now);
  osc.frequency.exponentialRampToValueAtTime(
    (notes[name] || 523) * (name === 'hurt' ? 0.5 : 1.5),
    now + 0.2,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(name === 'cast' ? 0.015 : 0.06, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.36);
}
function unlockAudio() {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
}
const currency = () =>
  `<span class="currency">${smallIcon('gem')}<b>${save.stones}</b><span>灵石</span></span><span class="currency iron"><i>◆</i><b>${save.iron}</b><span>玄铁</span></span>`;
function autoplayButton() {
  return `<button class="round-button auto-button ${save.autoplay ? 'active' : ''}" data-action="autoplay" aria-pressed="${save.autoplay}" title="自动走位、拾取与选择升级；点击切换手动">AI 代打 · ${save.autoplay ? '开' : '关'}</button>`;
}
function controls(inGame = false) {
  return `${autoplayButton()}<button class="round-button" data-action="sound" aria-label="${save.sound ? '关闭' : '开启'}音效" title="${save.sound ? '关闭' : '开启'}音效">${smallIcon(save.sound ? 'sound' : 'mute')}</button><button class="round-button help-button" data-action="guide" aria-label="修行指南" title="修行指南 · 玩法与道具">?</button>${inGame ? `<button class="round-button" data-action="pause" aria-label="暂停游戏" title="暂停 · Esc">${smallIcon('pause')}</button>` : ''}`;
}
function renderLobby() {
  const stage = STAGES[selectedStage],
    realm = realmInfo(save.cultivation);
  document.body.classList.remove('in-game');
  ui.innerHTML = `
    <header class="lobby-header">
      <a class="brand" href="#" data-action="home" aria-label="青岚仙途首页"><span class="brand-emblem">${icon('sword')}</span><span>青岚仙途<small>QINGLAN · IMMORTAL PATH</small></span><span class="seal">问道</span></a>
      <nav aria-label="修行菜单"><button class="nav-link active" data-action="home">秘境历练<span>EXPLORE</span></button><button class="nav-link" data-action="cultivation">洞府修炼<span>CULTIVATE</span></button><button class="nav-link" data-action="arsenal">藏器阁<span>ARTIFACTS</span></button><button class="nav-link" data-action="bestiary">妖物志<span>BESTIARY</span></button></nav>
      <div class="header-right">${currency()}${controls()}</div>
    </header>
    <main class="lobby-main">
      <section class="hero">
        <div class="hero-copy"><div class="eyebrow"><span></span>一人 · 一剑 · 一场长生梦</div><h1>御剑问长生<span>青岚入仙途</span></h1><p>踏入烟岚深处，执剑斩尽妖潮。<br>集天地灵气，炼本命法宝，从一介凡尘修至渡劫。</p>
          <div class="hero-features"><span>十六法宝</span><i>·</i><span>六重秘境</span><i>·</i><span>九大境界</span></div>
        </div>
        <button class="realm-preview" data-action="cultivation"><span class="vertical-poem">万法归一 · 道心长存</span><span class="realm-circle"><small>当前境界</small><strong>${REALMS[realm.index]}</strong><span>${['初期', '中期', '后期'][realm.step % 3]}</span></span><span class="realm-link">洞府修炼 ${smallIcon('arrow')}</span></button>
      </section>
      <section class="expedition" aria-label="选择秘境">
        ${pendingRun ? `<div class="resume-banner"><div><span class="status-dot"></span>尚有一段仙缘未了<small>${STAGES[pendingRun.stage].name} · ${formatTime(pendingRun.time)} · 局内 ${pendingRun.level} 级</small></div><button class="secondary-button" data-action="restore">继续上次历练 ${smallIcon('arrow')}</button></div>` : ''}
        <div class="section-heading"><div><span class="section-number">壹 / 陆</span><h2>择一秘境，启程修行</h2></div><span class="muted">已探索 ${save.completed.length} / 6 处秘境</span></div>
        <div class="stage-grid">${STAGES.map((s, i) => `<button class="stage-card ${i === selectedStage ? 'selected' : ''} ${i > save.unlocked ? 'locked' : ''}" data-action="stage" data-id="${i}" ${i > save.unlocked ? 'disabled' : ''} style="--stage-color:${s.color}"><span class="stage-top"><span>第${s.chapter}境</span>${i > save.unlocked ? smallIcon('lock') : save.completed.includes(i) ? '<span>已通关 ✓</span>' : '<span>可挑战</span>'}</span><strong>${s.name}</strong><span class="stage-bottom">${i > save.unlocked ? '通关前境解锁' : `${s.minutes} 分钟 · ${s.boss}`}</span><span class="stage-ornament">${s.chapter}</span></button>`).join('')}</div>
        <div class="expedition-footer"><div class="stage-description"><span class="tiny-diamond">◇</span><p>${stage.description}</p></div><div class="loadout-preview"><span>本命法宝</span><button data-action="arsenal">${icon(save.starter, treasure(save.starter).color)}${treasure(save.starter).name}${smallIcon('arrow')}</button></div></div>
        <div class="depart-row"><div class="difficulty-wrap"><span class="field-label">历练难度</span><div class="difficulty-switch" role="group" aria-label="历练难度">${DIFFICULTIES.map((d, i) => `<button data-action="difficulty" data-id="${i}" class="${i === difficulty ? 'active' : ''}" aria-pressed="${i === difficulty}">${d.name}<small>${i === 0 ? '推荐初修' : `收益 ×${d.reward}`}</small></button>`).join('')}</div></div><button class="primary-button embark" data-action="start" ${assetsReady ? '' : 'disabled'}><span>${assetsReady ? '踏入秘境' : '秘境凝聚中…'}</span>${smallIcon('arrow')}</button></div>
      </section>
    </main>
    <footer class="lobby-footer"><span class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>/ 方向键移动</span><i></i><span>自动施法 · 触屏拖动</span></span><span><span class="status-dot"></span>${storageAvailable ? '修行进度自动保存于本机' : '本机存档不可用'}</span><span class="footer-tag">心有所向 · 道阻且长</span></footer>`;
}
function showPanel(name: string) {
  panel = name;
  renderPanel();
}
function panelFrame(title: string, subtitle: string, body: string, wide = false) {
  modal.innerHTML = `<div class="modal-backdrop"><section class="panel ${wide ? 'wide-panel' : ''}" role="dialog" aria-modal="true" aria-label="${title}"><div class="panel-heading"><div><div class="eyebrow">${subtitle}</div><h2>${title}</h2></div><button class="round-button" data-action="close" aria-label="关闭">${smallIcon('close')}</button></div>${body}</section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function renderPanel() {
  if (panel === 'arsenal') {
    const t = treasure(selectedTreasure),
      level = save.forge[t.id] || 0,
      cost = forgeCost(level);
    const detail =
      bookTab === 'treasures'
        ? `<div class="treasure-detail"><div class="detail-emblem" style="--item-color:${t.color}">${icon(t.id, t.color)}</div><div class="detail-copy"><span class="item-tag">${t.tag}</span><h3>${t.name}<small>炼器 ${level} / 5</small></h3><p>${t.desc}</p><div class="evolution-recipe">${t.name}六重 + ${passive(t.passive).name}三重 <span>→ ${t.evolution}</span></div></div><div class="detail-actions"><button class="secondary-button" data-action="equip" ${save.starter === t.id ? 'disabled' : ''}>${save.starter === t.id ? '已设为本命法宝' : '设为本命法宝'}</button><button class="primary-button compact" data-action="forge" ${level >= 5 || save.iron < cost.iron || save.stones < cost.stones ? 'disabled' : ''}>${level >= 5 ? '炼器圆满' : `炼器 · ${cost.iron} 玄铁 + ${cost.stones} 灵石`}</button><small>每阶永久增加 8% 伤害</small></div></div>`
        : '<p class="panel-note">每局最多修炼 4 种功法，每种可升至五重。将对应功法修至三重，可使六重法宝进化为仙器。</p>';
    panelFrame(
      '万般法宝，皆可入道',
      '藏器阁 / ARTIFACT COLLECTION',
      `<div class="panel-toolbar"><div class="book-tabs"><button data-action="book-tab" data-id="treasures" class="${bookTab === 'treasures' ? 'active' : ''}">法宝 <b>${TREASURES.length}</b></button><button data-action="book-tab" data-id="passives" class="${bookTab === 'passives' ? 'active' : ''}">功法 <b>8</b></button></div><div class="header-right">${currency()}</div></div><div class="collection-grid">${
        bookTab === 'treasures'
          ? TREASURES.map(
              (t) =>
                `<button class="collection-card ${selectedTreasure === t.id ? 'selected' : ''}" data-action="treasure" data-id="${t.id}" style="--item-color:${t.color}">${icon(t.id, t.color)}<div><strong>${t.name}</strong><small>${t.tag}</small></div>${save.starter === t.id ? '<span class="equipped-label">本命</span>' : ''}<span class="forge-dots">${'◆'.repeat(save.forge[t.id] || 0)}${'◇'.repeat(5 - (save.forge[t.id] || 0))}</span></button>`,
            ).join('')
          : PASSIVES.map(
              (p) =>
                `<article class="passive-card">${icon(p.id, p.color)}<h3>${p.name}</h3><p>${p.desc}</p><small>共鸣：${
                  TREASURES.filter((t) => t.passive === p.id)
                    .map((t) => t.name)
                    .join('、') || '提升所有法宝'
                }</small></article>`,
            ).join('')
      }</div>${detail}<p class="panel-note">出发时携带 1 件本命法宝；历练中最多携带 6 件。精英宝匣可直接提升法宝重数，玄铁可用于局外永久炼器。</p>`,
      true,
    );
  } else if (panel === 'cultivation') {
    const r = realmInfo(save.cultivation);
    panelFrame(
      '积一寸修为，近一寸长生',
      '洞府 / CULTIVATION',
      `<div class="cultivation-overview"><div class="realm-circle"><small>当前境界</small><strong>${REALMS[r.index]}</strong><span>${['初期', '中期', '后期'][r.step % 3]}</span></div><div class="cultivation-progress"><h3>${r.name}<span>累计修为 ${save.cultivation}</span></h3><div class="thin-bar"><i style="width:${r.max ? 100 : Math.min(100, (r.progress / r.needed) * 100)}%"></i></div><p>${r.max ? '渡劫圆满，仙途无尽。' : `距下一境界还需 ${Math.max(0, r.needed - r.progress)} 修为，斩妖、升级实时积累，满额立即突破。`}</p><small>每次突破：永久气血 +3，法宝伤害 +2.5%，本局立即生效</small></div></div><div class="realm-road">${REALMS.map((r, i) => `<div class="${i === realmInfo(save.cultivation).index ? 'current' : i < realmInfo(save.cultivation).index ? 'passed' : ''}"><span>${['一', '二', '三', '四', '五', '六', '七', '八', '九'][i]}</span><strong>${r}</strong></div>`).join('')}</div><div class="section-heading"><h3>修习根基</h3><div class="header-right">${currency()}</div></div><div class="training-grid">${(
        [
          {
            id: 'vitality',
            name: '淬体',
            icon: 'guard',
            desc: '每阶气血上限 +10',
            detail: '筋骨如玉，百劫不摧',
          },
          {
            id: 'power',
            name: '悟道',
            icon: 'power',
            desc: '每阶法宝伤害 +5%',
            detail: '参悟万法，剑意自成',
          },
          {
            id: 'speed',
            name: '身法',
            icon: 'haste',
            desc: '每阶移动速度 +2%',
            detail: '身随风起，踏雪无痕',
          },
        ] as const
      )
        .map(
          (t) =>
            `<article class="training-card">${icon(t.icon, '#cfcb9c')}<h3>${t.name}<small>${save.training[t.id]} / 20 阶</small></h3><p>${t.detail}</p><strong>${t.desc}</strong><button class="secondary-button" data-action="train" data-id="${t.id}" ${save.training[t.id] >= 20 || save.stones < trainingCost(save.training[t.id]) ? 'disabled' : ''}>${save.training[t.id] >= 20 ? '修习圆满' : `修炼 · ${trainingCost(save.training[t.id])} 灵石`}</button></article>`,
        )
        .join(
          '',
        )}</div><p class="panel-note">斩妖与升级的修为实时入账，突破立即生效。通关额外修为、灵石和玄铁在历练结束时结算，失败也有收益。</p>`,
      true,
    );
  } else if (panel === 'bestiary') {
    const behavior: Record<string, string> = {
      chase: '追击 · 保持距离',
      ranged: '远程 · 侧向躲避灵弹',
      dash: '突袭 · 避开冲刺预警',
      tank: '重甲 · 持续输出',
      explode: '自爆 · 离开红圈',
      summon: '召唤 · 优先击杀',
      poison: '毒域 · 避开地面毒圈',
    };
    panelFrame(
      '知妖性，方能破万劫',
      '妖物志 / BESTIARY',
      `<p class="panel-note">十二种妖物随时间与秘境逐步加入妖潮。每分钟出现精英，倒计时结束后妖王现身；击败妖王才算通关。</p><div class="bestiary-grid">${ENEMIES.map((e) => `<article class="enemy-card"><span class="sprite-thumb ${e.sprite >= 8 ? 'extra-sprite' : ''}" style="${spriteStyle(e.sprite)}"></span><div><h3>${e.name}</h3><p>${behavior[e.behavior]}</p><small>基础气血 ${e.hp} · 伤害 ${e.damage}</small></div></article>`).join('')}</div><div class="boss-note">${smallIcon('book')} 妖王招式：直线冲撞、环形灵弹、落地法阵。半血后攻势加快，所有落地攻击均有红色预警。</div>`,
      true,
    );
  } else if (panel === 'guide') {
    panelFrame(
      '修行指南',
      '道法有迹 / THE CULTIVATOR’S HANDBOOK',
      `<div class="guide-tabs" role="group" aria-label="说明分类">${GUIDE_TABS.map((t) => `<button data-action="guide-tab" data-id="${t.id}" class="${guideTab === t.id ? 'active' : ''}" aria-pressed="${guideTab === t.id}">${t.title}</button>`).join('')}</div>${guideContent(guideTab)}<button class="primary-button guide-close" data-action="close">${game ? '返回暂停界面' : '道心已明'} ${smallIcon('arrow')}</button>`,
    );
  }
}
function renderHud() {
  if (!game) return;
  lastLoadout = '';
  document.body.classList.add('in-game');
  ui.innerHTML = `<div class="game-hud"><div class="player-panel"><div class="player-heading"><span id="realm-name">${realmInfo(save.cultivation).name}</span><b id="level" title="局内等级：收集灵气升级，选择法宝与功法">LV. 1</b></div><div class="health-label"><span>气血</span><span id="health-text">100 / 100</span></div><div class="health-bar"><i id="health-fill"></i></div><div class="cultivation-label"><span id="cultivation-text"></span><span>实时修为</span></div></div><div class="stage-timer"><div>${STAGES[game.stage].name}<i>·</i>${DIFFICULTIES[game.difficulty].name}</div><strong id="time">00:00</strong><span> / ${formatTime(STAGES[game.stage].minutes * 60)}</span><small id="wave-label">初入秘境 · 稳固道心</small></div><div class="combat-actions"><span class="kill-counter">斩妖 <b id="kills">0</b></span>${controls(true)}</div></div><div id="boss-bar" class="boss-bar" hidden><div><span>${STAGES[game.stage].boss}</span><small>妖王</small></div><div class="health-bar"><i></i></div></div><div id="notice" class="battle-notice"></div><div class="battle-bottom"><div class="battle-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键</span><small>触屏拖动 · 自动施法</small></div><div class="equipped-slots" id="equipped-slots"></div><div class="battle-objective"><span id="xp-text">灵气 0 / 20</span><small>存活历练 · 斩灭妖王</small></div></div><div class="passive-slots" id="passive-slots"></div><div class="xp-track"><i id="xp-fill"></i></div>`;
  updateHud();
}
let lastLoadout = '';
function updateHud() {
  if (!game) return;
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  };
  const realm = realmInfo(save.cultivation);
  set('realm-name', realm.name);
  set('cultivation-text', realm.max ? '渡劫圆满' : `${realm.progress} / ${realm.needed}`);
  set('level', `LV. ${game.level}`);
  set('health-text', `${Math.ceil(game.player.hp)} / ${game.player.maxHp}`);
  document.querySelector<HTMLElement>('#health-fill')!.style.width =
    `${Math.max(0, game.player.hp / game.player.maxHp) * 100}%`;
  set('kills', `${game.kills}`);
  set('time', formatTime(game.time));
  set('xp-text', `灵气 ${Math.floor(game.xp)} / ${xpNeeded(game.level)}`);
  document.querySelector<HTMLElement>('#xp-fill')!.style.width =
    `${Math.min(100, (game.xp / xpNeeded(game.level)) * 100)}%`;
  set(
    'wave-label',
    game.bossSpawned
      ? '妖王现身 · 决战之时'
      : game.time > 180
        ? '妖潮汹涌 · 固守道心'
        : game.time > 60
          ? '妖影渐密 · 精英出没'
          : '初入秘境 · 稳固道心',
  );
  const notice = document.getElementById('notice')!;
  notice.textContent = game.noticeTime > 0 ? game.notice : '';
  notice.classList.toggle('visible', game.noticeTime > 0);
  const bossBar = document.querySelector<HTMLElement>('#boss-bar')!;
  bossBar.hidden = !game.boss;
  if (game.boss)
    bossBar.querySelector<HTMLElement>('i')!.style.width =
      `${(game.boss.hp / game.boss.maxHp) * 100}%`;
  const loadout = JSON.stringify([
    game.weapons.map((w) => [w.id, w.level, w.evolved]),
    game.passives,
  ]);
  if (loadout !== lastLoadout) {
    lastLoadout = loadout;
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
}
function renderChoices() {
  if (!game) return;
  modal.innerHTML = `<div class="modal-backdrop upgrade-backdrop"><section class="upgrade-panel" role="dialog" aria-modal="true" aria-label="局内升级，选择一项机缘"><div class="upgrade-heading"><span class="eyebrow">灵气充盈 · 道法自成</span><h2>顿悟新机缘</h2><p>局内等级 <b>${game.level}</b> <span>·</span> 选择一项，续写你的修行之路</p></div><div class="choice-grid">${game.choices.map((c, i) => choiceCard(c, i)).join('')}</div><div class="upgrade-footer"><span>法宝 ${game.weapons.length} / 6 <i>·</i> 功法 ${Object.keys(game.passives).length} / 4</span><button class="secondary-button" data-action="reroll" ${game.rerolls === 0 ? 'disabled' : ''}>${smallIcon('refresh')}重悟机缘 <span>${game.rerolls} / 3</span></button>${autoplayButton()}<small>${save.autoplay ? 'AI 正在挑选适合当前搭配的机缘…' : '按 1 / 2 / 3 选择'}</small></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('.choice-card')?.focus();
}
function choiceCard(c: Choice, i: number) {
  const item =
    c.type === 'passive'
      ? passive(c.id)
      : c.type === 'heal'
        ? {
            name: '回春灵露',
            color: '#b6d8a5',
            desc: '恢复 40% 最大气血，并获得 1 枚玄铁。',
            id: 'duration',
          }
        : treasure(c.id);
  const tag =
    c.type === 'evolve'
      ? '仙器觉醒'
      : c.type === 'passive'
        ? '辅助功法'
        : c.type === 'heal'
          ? '修行馈赠'
          : c.level === 1
            ? '新法宝'
            : '法宝升阶';
  return `<button class="choice-card ${c.type === 'evolve' ? 'evolution-choice' : ''}" data-action="choose" data-id="${i}" style="--item-color:${item.color}"><div class="choice-top"><span>${tag}</span><kbd>${i + 1}</kbd></div><div class="choice-art">${icon(item.id, item.color)}</div><h3>${c.type === 'evolve' ? treasure(c.id).evolution : item.name}</h3><div class="choice-level">${c.type === 'evolve' ? '六重 → 仙器' : c.type === 'heal' ? '固本培元' : c.level === 1 ? '领悟 · 一重' : `${c.level - 1} 重 → ${c.level} 重`}</div><p>${c.type === 'evolve' ? '伤害大幅提升，施法更快，并强化法术形态。' : item.desc}</p><div class="choice-benefit">${c.type === 'weapon' ? (c.level > 1 ? '威力提升 · 强化法宝招式' : '纳入法宝栏 · 自动施放') : c.type === 'passive' ? '功效按重数叠加' : c.type === 'evolve' ? '仙器之力，尽破妖潮' : '恢复状态，继续修行'}</div><span class="choice-select">领悟此法 ${smallIcon('arrow')}</span></button>`;
}
function renderPause() {
  if (!game) return;
  panelFrame(
    '静心片刻',
    '修行暂歇 / PAUSED',
    `<p class="pause-description">${STAGES[game.stage].name} · ${formatTime(game.time)} · 已斩 ${game.kills} 妖</p><div class="pause-build">${game.weapons.map((w) => `<span>${icon(w.id, treasure(w.id).color)}${w.evolved ? treasure(w.id).evolution : treasure(w.id).name} · ${w.level}重</span>`).join('')}</div><p class="panel-note">${abandonConfirm ? '提前结束将按当前战绩结算收益，本次不会解锁下一秘境。' : '呼吸之间，万念归一。准备好后继续前行。'}</p><div class="pause-actions">${autoplayButton()}<button class="primary-button" data-action="resume">继续修行 ${smallIcon('play')}</button><button class="secondary-button" data-action="abandon">${abandonConfirm ? '确认结束并结算' : '结束本次历练'}</button></div>`,
  );
}
function renderResult() {
  if (!game || !rewards) return;
  const won = game.state === 'won',
    realm = realmInfo(save.cultivation).name;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="历练结算"><div class="result-seal">${won ? '破境' : '归来'}</div><div class="eyebrow">${STAGES[game.stage].name} · ${DIFFICULTIES[game.difficulty].name}</div><h2>${won ? '一剑荡妖尘' : '仙途漫漫，再行一程'}</h2><p>${won ? (game.stage === 5 ? '六境已破，长生之路仍可在更高难度中继续。' : `妖王已斩，${STAGES[game.stage + 1].name}已解锁。`) : '胜败皆为修行。此行所得，尽归道心。'}</p><div class="result-stats"><div><strong>${formatTime(game.time)}</strong><span>历练时长</span></div><div><strong>${game.kills}</strong><span>斩妖数量</span></div><div><strong>${game.level}</strong><span>局内等级</span></div></div><div class="reward-row"><span>${smallIcon('gem')}<b>+${rewards.stones}</b> 灵石</span><span>◆ <b>+${rewards.iron}</b> 玄铁</span><span>✧ <b>+${rewards.cultivation}</b> 本局修为</span></div><p class="panel-note">修为实时入账 ${rewards.cultivation - rewards.cultivationRemaining} · 本次补发 ${rewards.cultivationRemaining}，合计已计入永久修为。</p><div class="result-realm">${realm !== oldRealm ? `境界突破 · ${oldRealm} → ${realm}` : `当前境界 · ${realm}`}</div><div class="result-actions"><button class="secondary-button" data-action="return">返回洞府</button><button class="primary-button" data-action="${won && game.stage < 5 ? 'next' : 'retry'}">${won && game.stage < 5 ? '前往下一秘境' : '再入仙途'} ${smallIcon('arrow')}</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function startRun() {
  if (!assetsReady || selectedStage > save.unlocked) return;
  if (pendingRun) {
    panel = 'restart';
    panelFrame(
      '另启一段仙缘',
      '上次历练尚未结束',
      '<p class="panel-note">新开历练会放弃尚未结算的那一局。已经获得的永久修为、灵石和炼器进度不受影响。</p><div class="pause-actions"><button class="secondary-button" data-action="restore">继续上次历练</button><button class="primary-button" data-action="new-run">放弃旧局并开始</button></div>',
    );
    return;
  }
  clearInput();
  panel = '';
  modal.innerHTML = '';
  lastLoadout = '';
  settled = false;
  rewards = null;
  abandonConfirm = false;
  game = new Game(save, selectedStage, difficulty);
  game.onEvent = sound;
  previousState = 'playing';
  oldRealm = realmInfo(save.cultivation - game.creditedCultivation).name;
  renderHud();
  if (save.sound) unlockAudio();
  persist();
}
function restoreRun() {
  if (!pendingRun || !assetsReady) return;
  game = pendingRun;
  pendingRun = null;
  settled = false;
  rewards = null;
  abandonConfirm = false;
  selectedStage = game.stage;
  difficulty = game.difficulty;
  game.onEvent = sound;
  clearInput();
  panel = '';
  previousState = game.state;
  oldRealm = realmInfo(save.cultivation - game.creditedCultivation).name;
  renderHud();
  if (game.state === 'upgrade') renderChoices();
  else renderPause();
  if (save.sound) unlockAudio();
  persist();
}
function returnLobby() {
  game = null;
  panel = '';
  modal.innerHTML = '';
  previousState = '';
  clearInput();
  renderLobby();
}
function clearInput() {
  keys.clear();
  touchInput = { x: 0, y: 0 };
  pointer = null;
  joystick.classList.remove('active');
  if (game) game.input = { x: 0, y: 0 };
}
function handleAction(action: string, id?: string) {
  if (action === 'autoplay') {
    save.autoplay = !save.autoplay;
    clearInput();
    aiChoiceTime = 0;
    nextAiMove = 0;
    persist();
    if (game) {
      renderHud();
      if (game.state === 'upgrade') renderChoices();
      else if (game.state === 'paused' && panel !== 'guide') renderPause();
    } else renderLobby();
    toast(save.autoplay ? 'AI 代打已开启 · 自动走位与选技' : '已切回手动操作');
    return;
  }
  if (action === 'sound') {
    save.sound = !save.sound;
    if (save.sound) {
      unlockAudio();
      sound('select');
    }
    persist();
    if (game) renderHud();
    else renderLobby();
    return;
  }
  if (action === 'close') {
    if (game?.state === 'paused' && panel === 'guide') {
      panel = '';
      renderPause();
    } else if (game?.state === 'paused') {
      game.resume();
      modal.innerHTML = '';
    } else {
      panel = '';
      modal.innerHTML = '';
    }
    return;
  }
  if (action === 'home') {
    if (!game) {
      panel = '';
      modal.innerHTML = '';
      renderLobby();
    }
    return;
  }
  if (action === 'guide') {
    if (!game || game.state === 'playing' || game.state === 'paused') {
      if (game) {
        clearInput();
        game.pause();
        previousState = 'paused';
        persist();
      }
      showPanel('guide');
    }
    return;
  }
  if (action === 'guide-tab') {
    guideTab = id!;
    renderPanel();
    return;
  }
  if (action === 'cultivation' || action === 'arsenal' || action === 'bestiary') {
    if (!game) showPanel(action);
    return;
  }
  if (action === 'stage') {
    if (Number(id) <= save.unlocked) {
      selectedStage = Number(id);
      renderLobby();
    }
  }
  if (action === 'difficulty') {
    difficulty = Number(id);
    renderLobby();
  }
  if (action === 'treasure') {
    selectedTreasure = id!;
    renderPanel();
  }
  if (action === 'book-tab') {
    bookTab = id!;
    renderPanel();
  }
  if (action === 'equip') {
    save.starter = selectedTreasure;
    persist();
    renderLobby();
    renderPanel();
    toast(`已将${treasure(selectedTreasure).name}设为本命法宝`);
  }
  if (action === 'forge' && forge(save, selectedTreasure)) {
    persist();
    renderLobby();
    renderPanel();
    toast(`${treasure(selectedTreasure).name}炼器成功 · 伤害永久提升`);
  }
  if (action === 'train' && train(save, id as 'vitality' | 'power' | 'speed')) {
    persist();
    renderLobby();
    renderPanel();
    sound('upgrade');
  }
  if (action === 'start' || action === 'retry') startRun();
  if (action === 'restore') restoreRun();
  if (action === 'new-run') {
    pendingRun = null;
    startRun();
  }
  if (action === 'next' && game) {
    selectedStage = Math.min(5, game.stage + 1);
    startRun();
  }
  if (action === 'return') returnLobby();
  if (action === 'pause' && game) {
    clearInput();
    panel = '';
    game.pause();
    renderPause();
    persist();
  }
  if (action === 'resume' && game) {
    clearInput();
    panel = '';
    game.resume();
    modal.innerHTML = '';
  }
  if (action === 'abandon' && game) {
    if (!abandonConfirm) {
      abandonConfirm = true;
      renderPause();
    } else {
      game.state = 'lost';
    }
  }
  if (action === 'choose' && game?.choose(Number(id))) {
    clearInput();
    modal.innerHTML = '';
    updateHud();
    persist();
  }
  if (action === 'reroll' && game?.reroll()) {
    renderChoices();
    persist();
  }
}
document.addEventListener('click', (event) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!target || target.hasAttribute('disabled')) return;
  event.preventDefault();
  handleAction(target.dataset.action!, target.dataset.id);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && modal.innerHTML) {
    const elements = [
      ...modal.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'),
    ];
    if (!elements.length) return;
    const first = elements[0],
      last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'escape' || key === 'p') {
    if (event.repeat) return;
    if (panel === 'guide') handleAction('close');
    else if (game?.state === 'playing') handleAction('pause');
    else if (game?.state === 'paused') handleAction('resume');
    else if (panel) handleAction('close');
    return;
  }
  if (game?.state === 'upgrade' && ['1', '2', '3'].includes(key)) {
    event.preventDefault();
    handleAction('choose', `${Number(key) - 1}`);
    return;
  }
  if (
    ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key) &&
    game?.state === 'playing'
  ) {
    event.preventDefault();
    if (save.autoplay) handleAction('autoplay');
    keys.add(key);
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  clearInput();
  if (game?.state === 'playing') handleAction('pause');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInput();
    if (game?.state === 'playing') handleAction('pause');
  }
});
const canvas = renderer.canvas;
canvas.addEventListener('pointerdown', (e) => {
  if (game?.state !== 'playing' || pointer !== null) return;
  e.preventDefault();
  if (save.autoplay) handleAction('autoplay');
  pointer = e.pointerId;
  touchOrigin = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  joystick.style.left = `${e.clientX}px`;
  joystick.style.top = `${e.clientY}px`;
  joystick.classList.add('active');
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointer) return;
  const dx = e.clientX - touchOrigin.x,
    dy = e.clientY - touchOrigin.y,
    d = Math.hypot(dx, dy),
    factor = d > 45 ? 45 / d : 1;
  touchInput = { x: (dx * factor) / 45, y: (dy * factor) / 45 };
  joystick.querySelector<HTMLElement>('span')!.style.transform =
    `translate(${dx * factor}px, ${dy * factor}px)`;
});
const releasePointer = (e: PointerEvent) => {
  if (e.pointerId !== pointer) return;
  pointer = null;
  touchInput = { x: 0, y: 0 };
  joystick.classList.remove('active');
  joystick.querySelector<HTMLElement>('span')!.style.transform = '';
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('pagehide', () => {
  if (game && !settled) persist();
});
window.setInterval(() => {
  if (game && !settled) persist();
}, 5000);
let lastFrame = performance.now(),
  lastHud = 0,
  previousState = '',
  nextAiMove = 0,
  aiChoiceTime = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game) {
    if (save.autoplay) {
      if (game.state === 'playing' && now >= nextAiMove) {
        game.input = autoplayInput(game);
        nextAiMove = now + 120;
      }
      if (game.state === 'upgrade' && !document.hidden && document.hasFocus()) {
        aiChoiceTime += dt;
        if (aiChoiceTime >= 0.9) {
          const choice = autoplayChoice(game);
          if (choice) handleAction(choice.reroll ? 'reroll' : 'choose', `${choice.index}`);
          aiChoiceTime = 0;
        }
      } else aiChoiceTime = 0;
    } else
      game.input = {
        x:
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft')) +
          touchInput.x,
        y:
          Number(keys.has('s') || keys.has('arrowdown')) -
          Number(keys.has('w') || keys.has('arrowup')) +
          touchInput.y,
      };
    const realmBefore = realmInfo(save.cultivation).step;
    game.update(dt);
    if (game.state !== previousState) {
      clearInput();
      previousState = game.state;
      if (game.state === 'upgrade') {
        renderChoices();
        persist();
      }
      if (game.state === 'paused') renderPause();
      if ((game.state === 'won' || game.state === 'lost') && !settled) {
        settled = true;
        rewards = settleRun(save, {
          stage: game.stage,
          difficulty: game.difficulty,
          kills: game.kills,
          time: game.time,
          victory: game.state === 'won',
          iron: game.iron,
          level: game.level,
          creditedCultivation: game.creditedCultivation,
        });
        persist();
        renderResult();
      }
    }
    if (!settled && realmInfo(save.cultivation).step !== realmBefore) persist();
    if (now - lastHud > 100) {
      updateHud();
      lastHud = now;
    }
  }
  renderer.draw(game, now, game?.stage ?? selectedStage);
  requestAnimationFrame(frame);
}
renderLobby();
if (pendingRun) persist();
renderer.ready
  .then(() => {
    assetsReady = true;
    if (!game) renderLobby();
  })
  .catch(() => toast('场景素材加载失败，请刷新页面重试'));
requestAnimationFrame(frame);

// Development-only access for deterministic browser verification; omitted from production.
if (import.meta.env.DEV)
  Object.defineProperty(window, '__qinglan', {
    value: {
      get game() {
        return game;
      },
      get save() {
        return save;
      },
      start: startRun,
      home: returnLobby,
      renderer,
    },
  });
