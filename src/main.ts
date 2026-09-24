import './medicine.css';
import {
  medicineContent,
  medicineEntrance,
  type MedicineView,
  type MedicineTierFilter,
} from './medicine-ui.ts';
import { activeMedicines, refreshMedicineShop, medicineInfo } from './medicine-data.ts';
import { useMedicine, buyMedicine, craftMedicine, buyMedicineRecipe } from './medicine.ts';
import './style.css';
import './mortal.css';
import './journey-map.css';
import { journeyMap, JOURNEY_MAP_IMAGE, JOURNEY_MAP_MOBILE_IMAGE } from './journey-map.ts';
import { chronicleEntrance, chronicleContent } from './chronicle-ui.ts';
import { spiritPower } from './spirit-power.ts';
import { formatNumber } from './number-format.ts';
import {
  TREASURES,
  CULTIVATION_PATHS,
  pathInfo,
  isCultivationPath,
  allowsSchool,
  evolutionPassives,
  PASSIVES,
  STAGES,
  FINAL_TRIAL_STAGE,
  TRIAL_BOSS_STAGES,
  TRIAL_BOSS_TIMES,
  DIFFICULTIES,
  REALMS,
  REALM_VERSES,
  ENEMIES,
  ENEMY_TACTICS,
  ENEMY_SKILLS,
  enemyWave,
  STAGE_ENEMIES,
  treasure,
  passive,
  formatTime,
  xpNeeded,
  MAX_RUN_LEVEL,
  MAX_REVIVES,
  MAX_FORGE_LEVEL,
  spiritRootInfo,
  rollSpiritRoot,
  rootElementsFor,
  elementInfo,
  weaponRootBonus,
  ELEMENTS,
  SPIRIT_ROOTS,
  ROOT_STARTERS,
  type Treasure,
  type CultivationPath,
  type SpiritRootId,
  type ElementId,
  AD_SUPPLIES,
  STAGE_YEARS_PER_MINUTE,
} from './data.ts';
import {
  parseSave,
  freshSave,
  enterImmortalGate,
  SAVE_KEY,
  realmInfo,
  trainingCost,
  forgeCost,
  forgeDamageBonus,
  train,
  forge,
  settleRun,
  attuneSpiritRoot,
  alignStarterWithPath,
  lifespanInfo,
  extendLifespan,
  trainingYears,
  tribulationDue,
  completeTribulation,
  retreatPlan,
  retreat,
  type SaveData,
} from './progress.ts';
import { Game } from './game.ts';
import { exportSave, importSave, restoreSavedRun, MAX_SAVE_FILE_BYTES } from './save-transfer.ts';
import { autoplayChoice, autoplayInput } from './autoplay.ts';
import type { Choice } from './game.ts';
import { Renderer } from './render.ts';
import { icon, smallIcon } from './icons.ts';
import { GUIDE_TABS, guideContent } from './guide.ts';
import { GAME_SITE_URL } from './setting.ts';
import { spriteStyle } from './sprites.ts';
import { assetUrl } from './asset-url.ts';
import { MobileDisplay } from './mobile-display.ts';
import { shareImage } from './image-share.ts';
import { runLootContent } from './run-loot-ui.ts';
import { TownScene } from './town-scene.ts';
import { TOWN_START, HOMETOWN_START, townClockRunning } from './town.ts';
import {
  departHometown,
  acceptHometownRoot,
  hometownParents,
  visitHometown,
  readHometownLetter,
  type ParentId,
} from './hometown.ts';
import { freshTownPopulation, type TownResident } from './town-population.ts';
import { closeNpcChat, mountNpcChat, mountTeaStory } from './npc-chat.ts';
import { townVisit, townReturnMemory } from './town-history.ts';
import { visitTownImmortal, meetTownImmortal } from './town-immortal.ts';
import { chooseSmithStory } from './town-story.ts';
import {
  HUMAN_STORIES,
  chooseHumanStory,
  syncHumanStories,
  isHumanStoryId,
  unreadHumanLetterKeys,
} from './human-stories.ts';

import {
  advanceMortal,
  joinSect,
  leaveSect,
  startActivity,
  resolveActivity,
  tradeIron,
  sectDuesPending,
  settleSectDues,
} from './mortal.ts';
import {
  mortalPage,
  mortalStatus,
  townPage,
  townStatus,
  mortalTabContent,
  townEventContent,
  humanStoryContent,
  humanStoryJournal,
  hometownContent,
  hometownLetterContent,
  masteryDescription,
} from './mortal-ui.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="world" aria-label="修仙战斗场景"></canvas><div class="screen-grain"></div><div id="ui"></div><div id="modal-root"></div><div id="joystick"><span></span></div><div id="toast" role="status"></div>`;
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const modal = document.querySelector<HTMLDivElement>('#modal-root')!;
const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#world')!);
let sceneLoading = false;
let storageAvailable = true;
let raw: string | null = null;
try {
  raw = localStorage.getItem(SAVE_KEY);
} catch {
  storageAvailable = false;
}
const save = parseSave(raw);
// 每次进入先静音，保留音量，只有明确开启声音后才播放。
save.sound = false;
if (!save.journeyEnded && !save.pendingReincarnation) resolveActivity(save);
const PROLOGUE_IMAGE = '/assets/qinglan-prologue-dark.webp';
// 展示顺序独立于图集顺序，避免移动追魂钉后图标错位。
const catalogTreasures = [...TREASURES];
catalogTreasures.splice(
  catalogTreasures.findIndex((t) => t.id === 'nail'),
  1,
);
catalogTreasures.splice(
  catalogTreasures.findIndex((t) => t.school === 'demonic'),
  0,
  treasure('nail'),
);
let pendingRun: Game | null = null;
try {
  pendingRun = restoreSavedRun(save, JSON.parse(raw || '{}').activeRun);
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
let journeyCardReturn: 'chronicle' | 'lifespan-farewell' | 'tribulation-farewell' | 'epilogue' =
  'chronicle';
let inMortalWorld = false;
let mortalFilter = 'all';
let mortalTab: 'town' | 'sects' = 'town';
let inTown = false;
let townScene: TownScene | null = null;
let townPosition = { ...TOWN_START };
let townNpc: TownResident | null = null;
const shownHumanLetters = new Set<string>();
let lastMortalTick = performance.now();
let nextMortalStatus = 0;
let guideTab = 'basics';
let schoolFilter = 'all';
let bestiaryStage = -1;
let treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
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
let masterGain: GainNode | null = null;
let music: HTMLAudioElement | null = null;
let musicStarting = false;
let volumeOpen = false;
let resumeAfterDamage = false;
let adReadyAt = 0;
let adTimer: number | undefined;
let victoryTimer: number | undefined;
let rewardAd: 'root' | 'supplies' | null = null;
let rewardReturnPanel = '';
let rewardReturnScroll = 0;
let medicineView: MedicineView = 'bag';
let medicineTier: MedicineTierFilter = 'all';
let adRoot: SpiritRootId = 'heaven';
let adElements: ElementId[] = [];
let pendingImport: ReturnType<typeof importSave> | null = null;
function persist() {
  syncHumanStories(save);
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
function toast(text: string, duration = 3200) {
  const el = document.querySelector<HTMLDivElement>('#toast')!;
  el.textContent = text;
  el.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), duration);
}
let toastTimer = 0;
const mobileDisplay = new MobileDisplay(() => {
  const button = document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
  if (!button) return;
  button.textContent = mobileDisplay.active ? '还原' : '全屏';
  button.setAttribute('aria-label', mobileDisplay.active ? '退出全屏' : '进入全屏');
  button.setAttribute('aria-pressed', String(mobileDisplay.active));
});
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
  gain.connect(masterGain!);
  osc.start(now);
  osc.stop(now + 0.36);
}
function unlockAudio() {
  if (!save.sound) {
    if (masterGain && audio) masterGain.gain.setTargetAtTime(0, audio.currentTime, 0.02);
    music?.pause();
    return;
  }
  audio ??= new AudioContext();
  if (!masterGain) {
    masterGain = audio.createGain();
    masterGain.connect(audio.destination);
  }
  masterGain.gain.setTargetAtTime(save.volume, audio.currentTime, 0.02);
  if (!music) {
    music = new Audio(assetUrl('assets/audio/qinglan-mist.m4a'));
    music.loop = true;
    const musicGain = audio.createGain();
    musicGain.gain.value = 0.4;
    audio.createMediaElementSource(music).connect(musicGain);
    musicGain.connect(masterGain);
  }
  // 音乐独立加载，不阻塞场景；播放被浏览器拦截时，在下次操作重试。
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
  if (music.paused && !musicStarting) {
    musicStarting = true;
    void music
      .play()
      .catch(() => {})
      .finally(() => {
        musicStarting = false;
      });
  }
}
const currency = () =>
  `<span class="currency">${smallIcon('gem')}<b>${save.stones}</b><span>灵石</span></span><span class="currency iron"><i>◆</i><b>${save.iron}</b><span>玄铁</span></span>`;
function autoplayButton(inGame = false) {
  const title = save.autoplay
    ? '自动走位、拾取与选择升级；点击或移动键切回手动'
    : inGame
      ? '按 E 或点击开启自动走位、拾取与选择升级'
      : '点击开启自动走位、拾取与选择升级';
  return `<button class="round-button auto-button ${save.autoplay ? 'active' : ''}" data-action="autoplay" aria-pressed="${save.autoplay}" title="${title}">自动历练 · ${save.autoplay ? '开' : '关'}</button>`;
}
function fullscreenButton() {
  return mobileDisplay.available
    ? `<button class="round-button fullscreen-button" data-action="fullscreen" aria-label="${mobileDisplay.active ? '退出全屏' : '进入全屏'}" aria-pressed="${mobileDisplay.active}">${mobileDisplay.active ? '还原' : '全屏'}</button>`
    : '';
}
function controls(inGame = false) {
  return `${autoplayButton(inGame)}<span class="sound-control"><button class="round-button" data-action="sound" aria-label="${save.sound ? '调节音量' : '开启音乐与音效'}" title="${save.sound ? '调节音乐与音效音量' : '开启音乐与音效'}">${smallIcon(save.sound ? 'sound' : 'mute')}</button>${save.sound && volumeOpen ? `<div class="volume-control"><label>音乐与音效 <output>${Math.round(save.volume * 100)}%</output><input type="range" min="0" max="100" value="${Math.round(save.volume * 100)}" data-volume aria-label="音乐与音效音量" /></label><button data-action="mute">静音</button></div>` : ''}</span><button class="round-button help-button" data-action="guide" aria-label="修行指南" title="修行指南 · 玩法与道具">?</button>${inGame ? `<button class="round-button damage-button" data-action="damage" aria-label="伤害统计" title="查看本局法宝伤害占比">伤害</button>${fullscreenButton()}<button class="round-button" data-action="pause" aria-label="暂停游戏" title="暂停 · Esc">${smallIcon('pause')}</button>` : ''}`;
}
function realmVerse(realm: ReturnType<typeof realmInfo>) {
  return REALM_VERSES[realm.ascending ? '渡劫' : REALMS[realm.index]];
}
function completedJourney(realmName: string, immortal: boolean, verse: string) {
  return `<section class="hero journey-hero" aria-label="仙途通关"><div class="hero-copy"><div class="eyebrow"><span></span>七境已破 · 山河可期</div><h1>七境皆过客<span>天地一逍遥</span></h1><p>曾执一剑入青岚，今携万法越重山。<br>七境已破，天劫已散。往后山河，任你来去。</p><div class="journey-badges"><span>七境通关</span><span>天劫止息</span><span>修行永存</span></div><div class="journey-actions">${immortal ? `<button class="primary-button" data-action="immortal-gate">叩入仙门 ${smallIcon('arrow')}</button>` : ''}<button class="${immortal ? 'secondary-button' : 'primary-button'}" data-action="revisit">重游七境 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="arsenal">查看珍藏</button></div></div><button class="journey-portrait" data-action="cultivation" aria-label="当前${realmName}，进入洞府修炼"><span class="journey-orbit" aria-hidden="true"></span><span class="journey-poem">${verse}</span><span class="journey-character" style="${spriteStyle(0)}" aria-hidden="true"></span><span class="journey-realm"><small>此世道果</small><strong>${realmName}</strong><span>进入洞府 ${smallIcon('arrow')}</span></span></button></section><section class="journey-records" aria-label="此世修行成果"><div><span>累积修为</span><strong title="${save.cultivation.toLocaleString('zh-CN', { useGrouping: false })}">${Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1, useGrouping: false }).format(save.cultivation)}</strong><small>一念一境，皆成过往</small></div><div><span>此世年岁</span><strong>${Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1, useGrouping: false }).format(save.age)}<em>年</em></strong><small>岁月悠长，道心未改</small></div><div><span>法宝珍藏</span><strong>${save.artifacts.length}<em>/ ${TREASURES.length}</em></strong><small>万般法器，随心而御</small></div><div><span>历劫留印</span><strong>${save.tribulations}<em>枚</em></strong><small>气血 +${save.tribulations * 3}% · 伤害 +${save.tribulations * 2}%</small></div></section>`;
}
function renderLobby(returnYears?: number) {
  if (save.journeyEnded) {
    renderEpilogue();
    return;
  }
  if (resumeHometown()) return;
  leaveTown();
  if (assetsReady && !renderer.hasScene(selectedStage)) {
    ensureScene(selectedStage, () => renderLobby(returnYears));
    return;
  }
  if (inMortalWorld) persist();
  inMortalWorld = false;
  document.body.classList.remove('in-mortal');
  canvasDirty = true;
  void mobileDisplay.leave();
  const stage = STAGES[selectedStage],
    realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  const completed = save.completed.includes(FINAL_TRIAL_STAGE);
  document.body.classList.remove('in-game');
  document.body.classList.toggle('journey-complete', completed);
  document.body.classList.toggle('immortal-home', realm.max);
  ui.innerHTML = `
    <header class="lobby-header">
      <a class="brand" href="#" data-action="home" aria-label="叩仙门：青岚纪首页"><span class="brand-emblem">${icon('sword')}</span><span class="brand-title">叩仙门<small>青岚纪</small></span><span class="seal">${completed ? '圆满' : '问道'}</span></a>
      <nav aria-label="修行菜单"><button class="nav-link active" data-action="home">${completed ? '七境巡游' : '秘境历练'}</button><button class="nav-link" data-action="cultivation">洞府修炼</button><button class="nav-link" data-action="arsenal">藏器阁</button><button class="nav-link" data-action="bestiary">妖物志</button><button class="nav-link" data-action="medicine">炼丹炉</button></nav>
      <div class="header-right">${currency()}${controls()}</div>
    </header>
    <main class="lobby-main ${completed ? 'journey-lobby' : ''}">
      ${
        completed
          ? completedJourney(realm.name, realm.max, realmVerse(realm))
          : `<section class="hero">
        <div class="hero-copy"><div class="eyebrow"><span></span>青岚少年 · 觅长生 · 寻大道</div><h1>御剑问长生<span>青岚入仙途</span></h1><p>在青岚镇长大，十五岁踏上仙途。<br>为觅长生，为追寻大道，向山海深处去。</p>
          <div class="hero-features"><span>三十六法宝</span><i>·</i><span>七重秘境</span><i>·</i><span>正魔兼修</span></div>
        </div>
        <button class="realm-preview" data-action="cultivation"><span class="vertical-poem">${realmVerse(realm)}</span><span class="realm-circle"><small>当前境界</small><strong>${realm.ascending ? '渡劫' : REALMS[realm.index]}</strong><span>${realm.ascending ? '待破七境' : ['初期', '中期', '后期'][realm.step % 3]}</span></span><span class="realm-link">洞府修炼 ${smallIcon('arrow')}</span></button>
      </section>`
      }
      ${spiritRootSummary(true)}
      <section class="expedition" aria-label="选择秘境">
        ${pendingRun ? `<div class="resume-banner"><div><span class="status-dot"></span>尚有一段仙缘未了<small>${pendingRun.encounterName} · ${formatTime(pendingRun.time)} · ${pathInfo(pendingRun.path).name} · 局内 ${pendingRun.level} 级</small></div><button class="secondary-button" data-action="restore">继续上次历练 ${smallIcon('arrow')}</button></div>` : ''}
        <div class="journey-selection"><div class="journey-destination" aria-live="polite"><small>第${stage.chapter}境 · ${save.completed.includes(selectedStage) ? '故地重游' : '此行将至'}</small><h3>${stage.name}</h3><p>${stage.description}</p><div class="journey-destination-facts"><span>历练 ${stage.minutes} 分钟</span><span>每分钟 ${STAGE_YEARS_PER_MINUTE[selectedStage]} 年</span><span>妖王 · ${stage.boss}</span></div></div><div class="journey-depart"><div class="loadout-preview"><span>本命法宝</span><button data-action="arsenal">${icon(save.starter, treasure(save.starter).color)}${treasure(save.starter).name}${smallIcon('arrow')}</button></div><button class="primary-button embark" data-action="start" ${assetsReady ? '' : 'disabled'}><span>${assetsReady ? (completed ? '再入山河' : '踏入秘境') : '秘境凝聚中…'}</span>${smallIcon('arrow')}</button><small>${pathInfo(save.path).name} · ${DIFFICULTIES[difficulty].name}</small></div></div>
        <div class="path-selection"><span class="field-label">修行之道 · 本局法宝与功法路线</span><div class="path-grid" role="group" aria-label="选择修行路线">${CULTIVATION_PATHS.map((p) => `<button data-action="path" data-id="${p.id}" class="path-card ${save.path === p.id ? 'active' : ''}" aria-pressed="${save.path === p.id}" ${save.mortal.member && p.id !== save.path ? 'disabled' : ''} style="--path-color:${p.color}"><strong>${p.name}</strong><span>${p.desc}</span></button>`).join('')}</div><small>正道、魔道各 18 件法宝与 8 种功法，兼修可混搭。${save.mortal.member ? '宗门在籍：仅可修习本门路线，退宗后解锁其他路线。' : '路线仅影响新历练，续局保留原路线。'}</small></div>
        ${medicineEntrance(save, selectedStage)}
        <div class="depart-row"><div class="difficulty-wrap"><span class="field-label">历练难度</span><div class="difficulty-switch" role="group" aria-label="历练难度">${DIFFICULTIES.map((d, i) => `<button data-action="difficulty" data-id="${i}" class="${i === difficulty ? 'active' : ''}" aria-pressed="${i === difficulty}">${d.name}<small>${i === 0 ? '推荐初修' : `收益 ×${d.reward}`}</small></button>`).join('')}</div></div><button class="journey-map-link" data-action="journey-map">展开山河 · 另择秘境 <span aria-hidden="true">↓</span></button></div>
        ${journeyMap(save, selectedStage, window.matchMedia('(max-width: 640px)').matches)}
      </section>
    </main>
    <footer class="lobby-footer"><span class="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>/ 方向键移动</span><i></i><span>自动施法 · 触屏拖动</span></span><button class="lobby-save-status lobby-about${storageAvailable ? '' : ' storage-warning'}" data-action="about">${storageAvailable ? '关于《叩仙门》 · GitHub' : '本机存档不可用 · 关于《叩仙门》'}</button><span class="lobby-footer-links"><button class="prologue-revisit" data-action="prologue-revisit">重温序章</button>${chronicleEntrance(save)}</span></footer>`;
  ui.querySelector('.journey-actions [data-action="arsenal"]')?.remove();
  if (sectDuesPending(save)) renderSectDues();
  else if (returnYears !== undefined && returnYears > 0)
    toast(
      `山中一程，人间已过 ${returnYears < 0.1 ? '不足 0.1' : Number(returnYears.toFixed(1))} 年。`,
      3000,
    );
}
function updateStorySoundButton(button: HTMLButtonElement) {
  const label = save.sound ? '关闭声音' : '开启声音';
  button.innerHTML = smallIcon(save.sound ? 'sound' : 'mute');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(save.sound));
  button.title = label;
}
function renderEpilogue() {
  leaveTown();
  inMortalWorld = false;
  game = pendingRun = null;
  clearInput();
  void mobileDisplay.leave();
  document.body.classList.remove('in-game', 'in-mortal', 'journey-complete', 'immortal-home');
  ui.innerHTML = '';
  ui.inert = true;
  panel = 'epilogue';
  modal.innerHTML = `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene epilogue-scene" role="dialog" aria-modal="true" aria-labelledby="epilogue-title" tabindex="-1"><div class="prologue-controls"><button class="prologue-sound" data-action="epilogue-sound" aria-pressed="${save.sound}">${smallIcon(save.sound ? 'sound' : 'mute')}<span>${save.sound ? '关闭声音' : '开启声音'}</span></button><button class="prologue-skip" data-action="journey-card">留存此世</button></div><div class="prologue-heading"><span class="eyebrow">叩仙门：青岚纪 · 终章</span><h1 id="epilogue-title">云开<span>见长生</span></h1><p>此去长生，亦记人间。</p><span class="prologue-seal">此世圆满</span></div><div class="prologue-story" tabindex="0" aria-label="终章正文"><p>青岚山下，又是一年春水。炊烟漫过新修的青瓦，渡口有人挑起归灯。茶馆里醒木一响，说书人讲起一位从小镇走出的少年——讲到后来，连他的姓名，也渐渐成了传说。</p><p>你立在云海尽头，身后七境归于寂静。曾经惊心的雷声，已远得像一场旧雨。眼前仙门缓缓开启，没有谁问你斩过多少妖、炼成多少法，只见门上浮光如水，映出十五岁那年的衣衫。</p><p>那时行囊很轻，前路很远。你听闻天地间有长生，便以为走得足够远，就能将离别留在身后。直到春秋从指间流过，旧桥几度重修，熟悉的声音一个个散入晚风，才懂得：有些相逢虽只一瞬，也足以陪人走完漫长的一生。</p><p>仙门外的风吹动衣襟，你下意识拢了拢。恍惚间，青岚渡口的旧风，又从岁月深处吹来。</p><p>叩门之前，你曾最后回了一趟青岚。渡口坐着一个十五岁的少年，望着远山，问你外面的天地究竟有多大。你便在他身旁坐下，说起竹海之外的山川、云海尽头的星辰，也说起求道路上的风雪与险恶。末了，你告诉他：山河之外，还有求长生、问大道的路。</p><p>少年听得出神，眼里有一簇你熟悉的光。你忽然想起，许多年前，也有一位过路修士，在这里向你说过同样的话。临别时你替他拢好被风吹开的衣襟，只道：路远，记得添衣。</p><p>一步踏出，仙门在身后合拢。凡间不再有你的归舟，山河却仍循着自己的时序，迎春，送雪。而那个少年，终于背起轻轻的行囊，朝青岚山深处走去。</p><p class="prologue-last">山河未老，故人先秋。<br>幸而此心未改，来路仍明。<br><br>这一程山水，至此落笔。<br>长生已觅，大道无涯。</p></div><footer class="prologue-footer"><span>此世已结束 · 真仙<br>叩门于 ${save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁</span><button class="primary-button" data-action="epilogue-reincarnate">轮回转世 ${smallIcon('arrow')}</button></footer></section></div>`;
  updateStorySoundButton(modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!);
  const scene = modal.querySelector<HTMLElement>('.epilogue-scene')!;
  scene.style.setProperty(
    '--prologue-image',
    `url("${assetUrl('/assets/qinglan-prologue.webp')}")`,
  );
  scene.focus({ preventScroll: true });
}
function renderPrologue(replay = false) {
  if (save.journeyEnded) return;
  if ((!replay && save.prologueSeen) || game || inMortalWorld || panel) return;
  panel = 'prologue';
  ui.inert = true;
  modal.innerHTML = `<div class="modal-backdrop prologue-backdrop"><section class="prologue-scene" role="dialog" aria-modal="true" aria-labelledby="prologue-title" tabindex="-1"><div class="prologue-controls"><button class="prologue-sound" data-action="prologue-sound" aria-pressed="${save.sound}">${smallIcon(save.sound ? 'sound' : 'mute')}<span>${save.sound ? '关闭声音' : '开启声音'}</span></button><button class="prologue-skip" data-action="${replay ? 'prologue-enter' : 'prologue-skip'}">${replay ? '返回仙途' : '跳过开场'} ${smallIcon('arrow')}</button></div><div class="prologue-heading"><span class="eyebrow">叩仙门：青岚纪 · 序</span><h1 id="prologue-title">山河<span>一梦</span></h1><p>山河未老，故人先秋。</p><span class="prologue-seal" aria-hidden="true">问长生</span></div><div class="prologue-story" tabindex="0" aria-label="序章正文"><p>青岚山下，有一座临水的小镇。清晨炊烟漫过青瓦，暮色里渔火一盏盏亮起。人们在此迎春、送雪，把一生过成几声钟响。</p><p>你便生在这座小镇。儿时听过茶馆的醒木，也曾在渡口等过一盏归灯。镇上的人总说，稻熟一季，人又老了一岁。你渐渐明白，有些告别，来年春天也等不回。</p><p>十五岁那年，一位过路修士告诉你：山河之外，还有求长生、问大道的路。于是你收拾行囊，向青岚山深处走去。你想看看凡人的一生之外，天地究竟还有多远；也想在漫长岁月里，寻得一个不负此生的答案。</p><p>山外却有另一种岁月。传说云海尽头藏着仙门，一炉香可燃尽百年，一柄剑曾照彻长夜。有人得道归来，故园已成荒丘；有人问遍诸天，仍寻不回旧时的一场雨。</p><p>如今灵潮再起，沉寂的秘境次第苏醒。正道山门重开，魔宗旧灯复燃。风从竹海吹来，带着妖雾，也带着无人认领的仙缘。</p><p>你从青岚的烟火中来，以觅长生为愿，以追寻大道为志。此后每一次修行，都是向天地多问一句；而故乡的万家灯火，会在身后一代代明灭，提醒你为何出发。</p><p class="prologue-last">此去青岚，愿你历尽千劫，<br>仍记得为何出发。</p></div><footer class="prologue-footer"><span>一程山水，自此启行。</span><button class="primary-button" data-action="prologue-enter">${replay ? '返回仙途' : '入此山河'} ${smallIcon('arrow')}</button></footer></section></div>`;
  updateStorySoundButton(modal.querySelector<HTMLButtonElement>('[data-action="prologue-sound"]')!);
  modal
    .querySelector<HTMLElement>('.prologue-scene')!
    .style.setProperty('--prologue-image', `url("${assetUrl(PROLOGUE_IMAGE)}")`);
  modal.querySelector<HTMLElement>('.prologue-scene')?.focus({ preventScroll: true });
}
function releaseTownScene() {
  if (!townScene) return;
  townPosition = { ...townScene.position };
  townScene.destroy();
  townScene = null;
}
function leaveTown() {
  closeNpcChat();
  releaseTownScene();
  if (inTown) void mobileDisplay.leave();
  document.body.classList.remove('in-town');
  inTown = false;
  lastMortalTick = performance.now();
}
function mountTownScene() {
  const host = document.getElementById('town-view');
  if (!inTown || !host) return;
  if (!save.mortal.population) {
    save.mortal.population = freshTownPopulation(save.age);
    persist();
  }
  townScene = new TownScene(
    host,
    { ...townPosition },
    save.mortal.population,
    save.age,
    showTownEvent,
    save.mortal.scenery,
    save.mortal.hometown
      ? {
          state: save.mortal.hometown,
          interact: (target) => (target === 'dock' ? finishDeparture() : showHometown()),
          ready: () => {
            if (panel !== 'hometown-loading') return;
            if (save.mortal.hometown?.stage === 'farewell') {
              panel = 'hometown-farewell';
              ui.inert = true;
              modal.innerHTML =
                '<section class="hometown-farewell" role="dialog" aria-modal="true" aria-label="家门告别"><p><small>母亲</small>路远，记得添衣。</p><p><small>父亲</small>既选了这条路，便好好走。</p><p><small>母亲</small>有空便回来。</p><button class="primary-button" data-action="hometown-continue">记下叮嘱 · 前往渡口</button></section>';
              modal.querySelector<HTMLButtonElement>('button')?.focus();
            } else {
              panel = '';
              document.getElementById('town-view')?.focus({ preventScroll: true });
            }
          },
        }
      : undefined,
  );
}
function resumeHometown() {
  const home = save.mortal.hometown;
  if (
    !home ||
    home.stage === 'departed' ||
    !save.prologueSeen ||
    save.pendingReincarnation ||
    game ||
    pendingRun ||
    lifespanInfo(save).remaining === 0 ||
    tribulationDue(save)
  )
    return false;
  if (home.stage === 'reveal') {
    if (inTown) {
      leaveTown();
      inMortalWorld = false;
      document.body.classList.remove('in-mortal');
      ui.innerHTML = '';
    }
    renderRootReveal('十五岁，离乡问道。此世灵根已定，前路自此展开。', true);
  } else if (home.stage === 'farewell' && save.hometownSeen) {
    panel = 'hometown-choice';
    ui.inert = true;
    panelFrame(
      '再别青岚',
      '新一世 · 十五岁',
      '<p>故居门前，仍有这一世的亲人。你可以再走一程，也可以径直启程。</p><div class="save-actions hometown-choice-actions"><button class="primary-button" data-action="hometown-skip">径直启程</button><button class="secondary-button" data-action="hometown-walk">走一程故乡</button></div>',
    );
    modal.querySelector('[data-action="close"]')?.remove();
  } else renderDeparture();
  return true;
}
function renderDeparture() {
  leaveTown();
  closeNpcChat();
  inMortalWorld = inTown = true;
  townPosition = { ...HOMETOWN_START };
  save.mortal.population ??= freshTownPopulation(15);
  save.mortal.scenery ??= townVisit(undefined, 15);
  persist();
  panel = 'hometown-loading';
  modal.innerHTML = '';
  ui.inert = false;
  clearInput();
  document.body.classList.remove('in-game', 'journey-complete', 'immortal-home');
  document.body.classList.add('in-mortal', 'in-town');
  ui.innerHTML = townPage(save, fullscreenButton());
  mountTownScene();
}
function finishDeparture(skipOpening = false) {
  const next = structuredClone(save);
  if (skipOpening) next.prologueSeen = true;
  if (!departHometown(next)) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...next, activeRun: null }));
  } catch {
    toast('浏览器暂时无法保存离乡进度，请重试');
    return;
  }
  Object.assign(save, next);
  ui.inert = false;
  panel = '';
  modal.innerHTML = '';
  renderLobby();
  toast('十五岁，离乡问道。', 1800);
}
function showHometown(parent?: ParentId) {
  const home = save.mortal.hometown;
  if (
    !home ||
    home.stage !== 'departed' ||
    !inTown ||
    !townScene ||
    Math.hypot(townScene.position.x - HOMETOWN_START.x, townScene.position.y - HOMETOWN_START.y) >
      160
  )
    return;
  const parents = hometownParents(home, save.age);
  if (parent && !parents.some((p) => p.id === parent && p.alive)) return;
  closeNpcChat();
  const content = hometownContent(save, parent);
  if ((parent || parents.every((p) => !p.alive)) && visitHometown(save, parent)) persist();
  panel = 'hometown-home';
  panelFrame(
    parent ? parents.find((p) => p.id === parent)!.name : '故居',
    '青岚镇 · 门前旧路',
    content,
  );
  if (parent)
    mountNpcChat(modal.querySelector<HTMLElement>('.npc-dialogue')!, save, {
      id: parent,
      name: parents.find((p) => p.id === parent)!.name,
      generation: 0,
    });
}
function showTownEvent(npc: TownResident) {
  if (!inTown || townScene?.nearbyNpc?.id !== npc.id) return;
  townNpc = npc;
  panel = 'town-event';
  const visitor = save.mortal.immortal;
  if (visitor?.npcId === npc.id) {
    closeNpcChat();
    if (meetTownImmortal(save, npc.id, npc.name)) persist();
    panelFrame(
      '市井逢仙',
      `青岚镇 · 与${npc.name}的一席闲谈`,
      `<div class="town-story immortal-encounter"><p>那人混在赶集的人群里，衣衫寻常，正替摊主扶稳一盏旧灯。你停步问路，他却笑着说起千年前的渡口——连那时桥下的一株老柳，也记得清楚。</p><p>街声依旧喧闹，四周灵机却在他抬眼时静了一瞬。你才明白，眼前并非凡人。</p><p>“走得远了，才知人间一碗热茶，也值得回来。”他将一只小瓷瓶放入你掌心，“长生路长，莫只顾赶路。今日相逢，便赠你这一炉余香。”</p><p>再望去，他仍只是街巷里一张平常的面孔。你收好瓷瓶，把这场相逢记在心里。</p></div><p class="boss-reward">${medicineInfo(visitor.medicineId)!.name} · 一份<small>已收入丹囊 · 此次赠药仅一次</small></p><button class="primary-button" data-action="close">谢过前辈 · 继续游历</button>`,
    );
    return;
  }
  const storyId = Object.keys(HUMAN_STORIES).find(
    (id) => isHumanStoryId(id) && HUMAN_STORIES[id].npcId === npc.id,
  );
  const changed = syncHumanStories(save);
  const read = storyId && isHumanStoryId(storyId) && chooseHumanStory(save, storyId, 'read');
  if (changed || read) persist();
  panelFrame(npc.name, `${npc.place} · ${npc.role}`, townEventContent(save, npc));
  mountNpcChat(modal.querySelector<HTMLElement>('.npc-dialogue')!, save, npc);
}
function showTeaStory() {
  panel = 'tea-story';
  panelFrame(
    '一盏茶，半卷仙途',
    '听雨茶馆 · 仙途旧闻',
    '<section class="tea-story" aria-label="茶馆说书"><p class="tea-story-status panel-note" role="status">正在生成故事，请稍候…</p><div class="tea-story-text"></div><div class="save-actions"><button class="secondary-button tea-story-play" hidden>朗读故事</button><button class="secondary-button tea-story-stop" hidden disabled>停止朗读</button></div><p class="tea-story-image-status panel-note" role="status"></p><p class="panel-note">本次听书已消耗半载并判定机缘（30% 概率获赠 8 灵石）。失败重试不再扣年岁；再听一回会另耗半载并判定机缘。配图不阻塞正文，阅读与朗读不再计龄。</p><div class="save-actions"><button class="primary-button" data-action="close">回到街巷</button><button class="secondary-button tea-story-next" data-action="mortal-activity" data-id="tea" disabled>再听一回 · 半载</button><button class="secondary-button tea-story-retry" hidden disabled>重试这一回</button></div></section>',
  );
  void mountTeaStory(modal.querySelector<HTMLElement>('.tea-story')!, save, () => {
    save.sound = true;
    if (save.volume === 0) save.volume = 0.6;
    unlockAudio();
    persist();
  });
}
function renderMortal(enter = false) {
  if (syncHumanStories(save)) persist();
  if (enter && resolveActivity(save)) {
    if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
    persist();
  }
  releaseTownScene();
  const scroll = enter ? 0 : ui.scrollTop;
  if (enter) {
    inMortalWorld = true;
    inTown = false;
    mortalTab = 'town';
    lastMortalTick = performance.now();
    panel = '';
    modal.innerHTML = '';
    clearInput();
    void mobileDisplay.leave();
  }
  document.body.classList.remove('in-game', 'journey-complete', 'immortal-home');
  document.body.classList.add('in-mortal');
  document.body.classList.toggle('in-town', inTown);
  ui.innerHTML = inTown
    ? townPage(save, fullscreenButton())
    : mortalPage(save, mortalTab, mortalFilter, pendingRun?.path);
  ui.scrollTop = inTown ? 0 : scroll;
  mountTownScene();
  if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
  else if (tribulationDue(save)) renderTribulationPending();
  else if (sectDuesPending(save)) renderSectDues();
  else if (enter) {
    const letters = unreadHumanLetterKeys(save);
    if (letters.some((key) => !shownHumanLetters.has(key))) {
      panel = 'human-journal';
      panelFrame(
        '人间缘簿',
        `故人来信 · ${letters.length} 封未读旧信`,
        humanStoryJournal(save, false),
      );
      letters.forEach((key) => shownHumanLetters.add(key));
    }
  }
}
function syncMortalChange() {
  resolveActivity(save);
  if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
  persist();
  renderMortal();
}
function tickMortal(now: number) {
  if (
    !inMortalWorld ||
    (save.mortal.hometown && save.mortal.hometown.stage !== 'departed') ||
    !townClockRunning(inTown, !!townScene?.ready, !document.hidden, document.hasFocus(), panel)
  ) {
    lastMortalTick = now;
    return;
  }
  if (now - lastMortalTick < 250) return;
  const elapsed = (now - lastMortalTick) / 1000;
  lastMortalTick = now;
  const changed = advanceMortal(save, elapsed);
  townScene?.refreshResidents(save.age);
  if (sectDuesPending(save)) {
    persist();
    renderSectDues();
    return;
  }
  if (lifespanInfo(save).remaining < 1e-9 || tribulationDue(save)) {
    renderLobby();
    if (tribulationDue(save)) renderTribulationPending();
    else renderLifespanEnd();
    persist();
    return;
  }
  if (changed) {
    syncMortalChange();
    toast(save.mortal.events[0]);
  } else if (now >= nextMortalStatus) {
    const status = document.getElementById('mortal-status');
    if (status) status.innerHTML = mortalStatus(save);
    const townHud = document.getElementById('town-status');
    if (townHud) townHud.innerHTML = townStatus(save);
    nextMortalStatus = now + 1000;
  }
}
const ROOT_IMPRESSIONS: Record<SpiritRootId, { seal: string; verse: string }> = {
  heaven: { seal: '天', verse: '一气天成，百脉皆通。长生路上，似有清风送君行。' },
  variant: { seal: '异', verse: '灵机独异，不循常途。天地万法，或为你另开一门。' },
  dual: { seal: '凡', verse: '两脉相依，资质平常。肯踏千山，凡根亦可问长生。' },
  triple: { seal: '凡', verse: '三脉交织，仙路渐远。不借天资，便以岁月磨道心。' },
  quad: { seal: '伪', verse: '四脉纷杂，聚气维艰。命数未许，仍可执灯向山行。' },
  five: { seal: '伪', verse: '五行俱在，却难归一。大道无言，且看你如何叩门。' },
  none: { seal: '废', verse: '五行沉寂，仙缘如尘。若道心不灭，凡骨也敢问苍天。' },
};
function spiritRootDiagram(reveal = false) {
  const root = spiritRootInfo(save.spiritRoot);
  const vertices = ELEMENTS.map((element, i) => {
    const angle = ((i * 72 - 90) * Math.PI) / 180;
    return {
      ...element,
      x: (50 + Math.cos(angle) * 40).toFixed(2),
      y: (50 + Math.sin(angle) * 40).toFixed(2),
      active: save.rootElements.includes(element.id),
    };
  });
  const rootLabel = `${root.name}；${vertices.map((e) => `${e.name}灵根${e.active ? '已显现' : '未显现'}`).join('，')}`;
  return `<div class="root-pentagon" role="img" aria-label="${rootLabel}"><svg class="root-pentagon-lines" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/><polygon points="${vertices.map((e) => `${e.x},${e.y}`).join(' ')}"/>${vertices.map((e) => `<path d="M50 50L${e.x} ${e.y}"/>`).join('')}</svg><div class="root-quality"><small>此世灵根</small><strong>${reveal ? ROOT_IMPRESSIONS[save.spiritRoot].seal : root.name}</strong><small>${reveal ? `${root.name} · ` : ''}${root.count ? `${root.count} 系共鸣` : '五行未显'}</small></div>${vertices.map((e) => `<span class="root-node${e.active ? ' is-active' : ''}" style="--root-x:${e.x}%;--root-y:${e.y}%;--element-color:${e.color}"><i class="root-orb"></i><span>${e.name}</span></span>`).join('')}</div>`;
}
function spiritRootEffects() {
  const root = spiritRootInfo(save.spiritRoot);
  return `灵气获取 · 修为积累 <b>${Math.round(root.rate * 100)}%</b><br>${root.count ? `对应属性法宝伤害 <b>+${root.damageBonus}%</b>` : '法宝伤害加成 <b>0%</b>'}<br>基础气血 <b>${root.baseHp}</b> · 基础回血 <b>${root.baseRegen.toFixed(2)}/秒</b><br>基础暴击 <b>${Math.round(root.baseCrit * 100)}%</b> · 基础移速 <b>${root.baseSpeed}</b><br>悟道每阶独立增伤 <b>+${root.powerPerLevel}%</b>`;
}
function spiritRootSummary(showAge = false) {
  const life = lifespanInfo(save);
  return `<div class="spirit-root-summary"><div class="root-identity">${spiritRootDiagram()}${showAge ? `<small class="root-age">年岁 <b>${life.age.toFixed(1)}</b> / ${Number.isFinite(life.limit) ? `${life.limit} 年寿元` : '无限寿元'}</small>` : ''}</div><p>${spiritRootEffects()}<small>刷新保留 · 轮回重抽资质与五行</small></p><button class="secondary-button" data-action="root-guide">资质说明 ${smallIcon('arrow')}</button><div class="spirit-root-rewards"><button class="secondary-button" data-action="watch-root-ad">看广告 · 自选灵根</button><button class="secondary-button" data-action="reincarnate">轮回转世 · 重启仙途</button></div></div>`;
}
function lifespanSummary() {
  const life = lifespanInfo(save);
  return `<div class="lifespan-summary"><strong>年岁 ${life.age.toFixed(1)} / ${Number.isFinite(life.limit) ? `${life.limit} 年寿元` : '无限寿元'}</strong><span>${STAGES[selectedStage].name} · 战斗每分钟 ${STAGE_YEARS_PER_MINUTE[selectedStage]} 年</span><small>年龄跨局累计，突破大境界延寿；大乘起长生。暂停不计龄，寿尽迎来此世终章，轮回将清空本世进度。${save.lifespanBonus ? `已借寿 ${save.lifespanBonus} 年。` : ''}</small>${save.completed.includes(FINAL_TRIAL_STAGE) ? `<small>七境已通关 · 不再降临天劫 · 已获劫印保留：气血 +${save.tribulations * 3}% / 伤害 +${save.tribulations * 2}%</small>` : save.nextTribulationAge ? `<small>天劫每两万年一次 · 距下次 ${Math.max(0, save.nextTribulationAge - save.age).toFixed(1)} 年 · 已渡 ${save.tribulations} 劫 · 劫印气血 +${save.tribulations * 3}% / 伤害 +${save.tribulations * 2}%</small>` : ''}</div>`;
}
function retreatEstimate(years: number) {
  const plan = retreatPlan(save, years);
  if (!plan) return '请输入正数年限（最多一位小数），并留有剩余寿元。';
  return `实际度过 ${Number(plan.years.toFixed(1))} 年 · ${Number.isFinite(lifespanInfo(save).limit) ? `预计修为 +${plan.cultivation.min}～${plan.cultivation.max}（本大境界总修为的 ${Number(plan.cultivation.minPercent.toFixed(2))}%～${Number(plan.cultivation.maxPercent.toFixed(2))}%，不足 1 点舍去）· 另有 ${Number((plan.chance * 100).toFixed(2))}% 概率获得属性提升` : save.completed.includes(FINAL_TRIAL_STAGE) ? '无修为或属性收益 · 通关后不再受天劫截停' : '大乘起无修为或属性收益，到天劫自动出关'}`;
}
function retreatSection() {
  const life = lifespanInfo(save);
  const immortal = !Number.isFinite(life.limit);
  const years = immortal
    ? 1000
    : Math.max(0.1, Math.floor(Math.min(life.limit * 0.1, life.remaining / 2) * 10) / 10);
  return `<div class="section-heading"><h3>闭关修炼</h3><span>只耗年岁 · 不花灵石</span></div><p class="panel-note">${immortal ? (save.completed.includes(FINAL_TRIAL_STAGE) ? '七境已破，天劫不再降临。闭关只推进年岁，不获得修为或属性；可按填写年数出关。' : '大乘起闭关不再获得修为或属性，只推进年岁；到达天劫时立即出关迎劫。') : '闭关获得少量随机修为：按投入年数占寿元上限的比例计算，灵根越好收益越高，明显慢于历练。长时间闭关有机会推进小阶段；一世寿元全部闭关仍不足以跨越一个完整大境界。另按相同比例抽取属性提升，例如寿元 100 年闭关 50 年，有 50% 概率随机提升气血、法宝伤害或移速中的一项 1%～3%。不增加根基阶数。'}</p><div class="retreat-form"><label for="retreat-years">闭关年数<input id="retreat-years" type="number" inputmode="decimal" min="0.1" step="0.1" value="${years}" required aria-describedby="retreat-estimate"></label><button class="secondary-button" data-action="retreat" ${retreatPlan(save, years) ? '' : 'disabled'}>开始闭关</button></div><p class="panel-note" id="retreat-estimate" role="status">${retreatEstimate(years)}</p><p class="panel-note">闭关累计：气血 +${save.retreatBonus.vitality}% · 法宝伤害 +${save.retreatBonus.power}% · 移速 +${save.retreatBonus.speed}%。轮回后清空。</p>`;
}
function weaponAffinity(
  item: Treasure,
  root: SpiritRootId = save.spiritRoot,
  elements: ElementId[] = save.rootElements,
  compact = false,
) {
  const element = elementInfo(item.element);
  const bonus = Math.round(weaponRootBonus(root, elements, item) * 100);
  return `<span class="element-affinity ${bonus ? 'resonant' : ''}" style="--element-color:${element.color}">${element.name}系${bonus ? ` · ${compact ? '' : '灵根加伤 '}+${bonus}%` : compact ? '' : ' · 无灵根加成'}</span>`;
}
function evolutionRecipe(t: Treasure, path: CultivationPath) {
  const partners = evolutionPassives(t, path).map((id) => `${passive(id).name}五重`);
  return `<div class="evolution-recipe"><span>仙器 · ${t.evolution}</span><div>${t.name}六重 ＋ ${partners.length > 1 ? `（${partners.join(' 或 ')}）` : partners[0]}</div></div>`;
}
function showPanel(name: string) {
  panel = name;
  renderPanel();
}
function panelFrame(title: string, subtitle: string, body: string, wide = false) {
  closeNpcChat();
  const existing = modal.querySelector<HTMLElement>('.modal-backdrop > .panel');
  const focused =
    document.activeElement instanceof HTMLElement ? document.activeElement.dataset : {};
  const scroll = existing?.scrollTop ?? 0;
  if (!existing)
    modal.innerHTML =
      '<div class="modal-backdrop"><section role="dialog" aria-modal="true"></section></div>';
  const section = modal.querySelector<HTMLElement>('section')!;
  section.className = `panel ${wide ? 'wide-panel' : ''} ${panel === 'arsenal' || panel === 'guide' || panel === 'bestiary' ? 'tabbed-panel' : ''}`;
  section.setAttribute('aria-label', title);
  section.innerHTML = `<div class="panel-heading"><div><div class="eyebrow">${subtitle}</div><h2>${title}</h2></div><button class="round-button" data-action="close" aria-label="关闭">${smallIcon('close')}</button></div>${body}`;
  if (existing) {
    section.scrollTop = scroll;
    [...section.querySelectorAll<HTMLButtonElement>('button')]
      .find(
        (button) => button.dataset.action === focused.action && button.dataset.id === focused.id,
      )
      ?.focus({ preventScroll: true });
  } else section.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
async function renderJourneyCard() {
  if (
    panel === 'chronicle' ||
    panel === 'lifespan-farewell' ||
    panel === 'tribulation-farewell' ||
    panel === 'epilogue'
  )
    journeyCardReturn = panel;
  panel = 'journey-card';
  panelFrame(
    '此世留影',
    '留存此世 · 本地生成',
    '<div class="journey-card-preview"><p class="panel-note" role="status">正在生成此世留影，请稍候……可随时关闭。</p></div>',
  );
  const host = modal.querySelector<HTMLElement>('.journey-card-preview')!;
  modal.querySelector('.panel')?.scrollTo(0, 0);
  modal.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus({ preventScroll: true });
  try {
    const snapshot = structuredClone(save);
    const { createJourneyCard } = await import('./journey-card.ts');
    if (!host.isConnected) return;
    const url = await createJourneyCard(
      snapshot,
      journeyCardReturn === 'lifespan-farewell'
        ? 'lifespan'
        : journeyCardReturn === 'tribulation-farewell'
          ? 'tribulation'
          : undefined,
    );
    if (!host.isConnected) return;
    host.innerHTML =
      '<img alt="此世留影纪念卡预览"><div class="save-actions"><button class="primary-button">分享此世</button><a class="secondary-button" download="叩仙门：青岚纪-此世留影.png" tabindex="0">保存图片</a></div><p class="panel-note" role="status">支持时打开系统分享面板，不支持时保存 PNG；手机也可长按图片。纪念图不能用于恢复存档，二维码不携带存档数据。</p>';
    host.querySelector('img')!.src = url;
    const download = host.querySelector('a')!;
    download.href = url;
    const file = new File(
      [Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0))],
      download.download,
      { type: 'image/png' },
    );
    const button = host.querySelector('button')!;
    button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      const result = await shareImage(file);
      if (!host.isConnected) return;
      button.disabled = false;
      if (result === 'save') download.click();
      host.querySelector('[role="status"]')!.textContent =
        result === 'shared'
          ? '已交给系统分享面板。'
          : result === 'cancelled'
            ? '已取消分享，图片仍在，可再次分享或保存。'
            : '系统图片分享不可用，已尝试保存 PNG；也可点击保存图片或长按图片。';
    };
  } catch {
    if (!host.isConnected) return;
    host.innerHTML =
      '<p class="panel-note" role="alert">此世留影生成失败，未能生成图片。请重试，或关闭后稍后再来；此世进度不受影响。</p><button class="secondary-button" data-action="journey-card">重新生成</button>';
  }
}
function renderPanel() {
  if (panel === 'about') {
    panelFrame(
      '关于《叩仙门》',
      '独立制作 · 持续更新',
      `<div class="about-copy"><p class="about-lead">《叩仙门：青岚纪》是一款独立制作的 Web 修仙小游戏。</p><div class="about-maker"><span>制作</span><strong>一个想做点自己喜欢的东西的程序员 chenxuan，和一堆 AI 工具。</strong><p>从幸存者玩法出发，慢慢做成了一场关于修行、岁月与故人的仙途。</p></div><p class="panel-note">程序设计、玩法与内容由作者持续迭代；部分开发、美术生成与辅助工作使用 AI 工具完成。项目持续更新中，源码公开于 GitHub。</p><div class="about-meta"><p><span>GitHub</span><a href="https://github.com/chenxuan520/qinglan-xiuxian" target="_blank" rel="noopener noreferrer" tabindex="0">chenxuan520/qinglan-xiuxian</a></p><p><span>官网</span><a href="${GAME_SITE_URL}" target="_blank" rel="noopener noreferrer" tabindex="0">${new URL(GAME_SITE_URL).host}</a></p></div><div class="save-actions about-actions"><a class="primary-button" href="https://github.com/chenxuan520/qinglan-xiuxian" target="_blank" rel="noopener noreferrer" tabindex="0">GitHub 源码</a><a class="secondary-button" href="https://github.com/chenxuan520/qinglan-xiuxian/issues" target="_blank" rel="noopener noreferrer" tabindex="0">反馈问题</a></div></div>`,
    );
  } else if (panel === 'medicine') {
    if (medicineView === 'shop' && refreshMedicineShop(save.medicine, save.age)) persist();
    panelFrame(
      '丹香入道',
      '炼丹炉',
      medicineContent(
        save,
        selectedStage,
        medicineView,
        !!(game || pendingRun),
        inTown && townNpc?.id === 'herbs',
        medicineTier,
      ),
      true,
    );
  } else if (panel === 'arsenal') {
    const visibleTreasures = catalogTreasures.filter(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    );
    const t = treasure(selectedTreasure),
      level = save.forge[t.id] || 0,
      cost = forgeCost(level),
      owned = save.artifacts.includes(t.id);
    const detail =
      bookTab === 'treasures'
        ? `<div class="treasure-detail"><div class="detail-emblem" style="--item-color:${t.color}">${icon(t.id, t.color)}</div><div class="detail-copy"><span class="item-tag">${pathInfo(t.school).name} · ${t.tag}</span><h3>${t.name}<small>炼器 ${level} / ${MAX_FORGE_LEVEL}</small></h3><p>${t.desc}</p>${weaponAffinity(t)}${evolutionRecipe(t, save.path)}<p>法宝六重与任一配套功法五重齐备后，在局内升级中选择仙器觉醒。这里的重数是局内等级，与永久炼器阶数无关。</p></div><div class="detail-actions"><button class="secondary-button" data-action="equip" ${!owned || save.starter === t.id || !allowsSchool(save.path, t.school) ? 'disabled' : ''}>${!owned ? '需击败妖王获得遗宝' : !allowsSchool(save.path, t.school) ? `需选择${pathInfo(t.school).name}或兼修` : save.starter === t.id ? '已设为本命法宝' : '设为本命法宝'}</button><button class="primary-button compact" data-action="forge" data-cost-stones="${cost.stones}" data-cost-iron="${cost.iron}" ${!owned || level >= MAX_FORGE_LEVEL ? 'disabled' : ''}>${!owned ? '尚未收藏 · 可局内领悟' : level >= MAX_FORGE_LEVEL ? '炼器圆满' : `炼器 · ${cost.iron} 玄铁 + ${cost.stones} 灵石`}</button><small>炼器伤害 +${Math.round(forgeDamageBonus(level) * 100)}%${level < MAX_FORGE_LEVEL ? ` · 下一阶 +${Math.round(forgeDamageBonus(level + 1) * 100)}%（较当前提升 ${(((1 + forgeDamageBonus(level + 1)) / (1 + forgeDamageBonus(level)) - 1) * 100).toFixed(1)}%）` : ' · 十阶圆满'}</small></div></div>`
        : '<p class="panel-note">正道与魔道各 8 种功法，纯修仅出现本流派功法，兼修可自由混搭。每局最多修炼 4 种，每种可升至五重。将对应功法修满五重，才可使六重法宝进化为仙器。</p>';
    panelFrame(
      '万般法宝，皆可入道',
      '藏器阁',
      `<p class="panel-note">已收藏 ${save.artifacts.length} / ${TREASURES.length} 件 · 妖王必掉 3 件未拥有法宝，击败即收入藏器阁，可设本命与炼器。</p><div class="panel-toolbar"><div class="book-tabs"><button data-action="book-tab" data-id="treasures" class="${bookTab === 'treasures' ? 'active' : ''}">法宝 <b>${TREASURES.length}</b></button><button data-action="book-tab" data-id="passives" class="${bookTab === 'passives' ? 'active' : ''}">功法 <b>${PASSIVES.length}</b></button></div><div class="header-right">${currency()}</div></div><div class="guide-tabs" role="group" aria-label="物品流派筛选">${[{ id: 'all', name: '全部流派' }, ...CULTIVATION_PATHS.filter((p) => p.id !== 'dual')].map((p) => `<button data-action="school-filter" data-id="${p.id}" class="${schoolFilter === p.id ? 'active' : ''}" aria-pressed="${schoolFilter === p.id}">${p.name}</button>`).join('')}</div>${
        bookTab === 'treasures'
          ? `<div class="guide-tabs collection-pages" role="group" aria-label="法宝分页">${Array.from(
              { length: Math.ceil(visibleTreasures.length / 12) },
              (_, page) => page,
            )
              .map(
                (page) =>
                  `<button data-action="treasure-page" data-id="${page}" aria-pressed="${treasurePage === page}" class="${treasurePage === page ? 'active' : ''}">${page * 12 + 1}–${Math.min(visibleTreasures.length, page * 12 + 12)} / ${visibleTreasures.length}</button>`,
              )
              .join('')}</div>`
          : ''
      }<div class="collection-grid ${bookTab === 'treasures' ? 'treasure-grid' : ''}">${
        bookTab === 'treasures'
          ? visibleTreasures
              .slice(treasurePage * 12, treasurePage * 12 + 12)
              .map(
                (t) =>
                  `<button class="collection-card ${selectedTreasure === t.id ? 'selected' : ''}${save.artifacts.includes(t.id) ? '' : ' is-unowned'}" data-action="treasure" data-id="${t.id}" style="--item-color:${t.color}">${icon(t.id, t.color)}<div><strong>${t.name}</strong><small>${pathInfo(t.school).name} · ${save.artifacts.includes(t.id) ? '已收藏' : '待收集'}</small>${weaponAffinity(t, save.spiritRoot, save.rootElements, true)}${evolutionRecipe(t, save.path)}</div>${save.starter === t.id ? '<span class="equipped-label">本命</span>' : ''}<span class="forge-dots">炼器 ${save.forge[t.id] || 0} / ${MAX_FORGE_LEVEL}</span></button>`,
              )
              .join('')
          : PASSIVES.filter((p) => schoolFilter === 'all' || p.school === schoolFilter)
              .map(
                (p) =>
                  `<article class="passive-card">${icon(p.id, p.color)}<h3>${p.name}</h3><span class="school-label" style="color:${pathInfo(p.school).color}">${pathInfo(p.school).name} · 每重效果</span><p>${p.desc}</p><small>${masteryDescription(save, p.id)}</small><small>共鸣：${
                    TREASURES.filter((t) => evolutionPassives(t).includes(p.id))
                      .map((t) => t.name)
                      .join('、') || '提升所有法宝'
                  }</small></article>`,
              )
              .join('')
      }</div>${detail}<p class="panel-note">当前路线：${pathInfo(save.path).name}。纯修只领悟本流派法宝和功法，兼修可混搭。出发携带 1 件本命法宝，局内最多 6 件。精英宝匣可直接提升法宝重数，妖王遗宝收入藏器阁后可设本命与永久炼器；未收藏法宝仍可在局内领悟。</p>`,
      true,
    );
  } else if (panel === 'cultivation') {
    const r = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
    const current = spiritPower(save);
    const next = r.max
      ? null
      : spiritPower({
          ...save,
          cultivation: save.cultivation + Math.max(0, r.needed - r.progress),
          completed: r.step === 23 ? [...save.completed, FINAL_TRIAL_STAGE] : save.completed,
        });
    panelFrame(
      '积一寸修为，近一寸长生',
      '洞府',
      `<div class="cultivation-overview"><div class="realm-circle"><small>当前境界</small><strong>${r.ascending ? '渡劫' : REALMS[r.index]}</strong><span>${r.max ? '长生久视' : r.ascending ? '待破七境' : ['初期', '中期', '后期'][r.step % 3]}</span></div><div class="cultivation-progress"><h3>${r.name}<span>累计修为 ${save.cultivation}</span></h3><p class="realm-verse">${realmVerse(r)}</p><div class="thin-bar"><i style="width:${r.max ? 100 : Math.min(100, (r.progress / r.needed) * 100)}%"></i></div><p>${r.max ? '真仙 · 长生久视，仙途无尽。' : r.ascending ? '修为已达标，正待渡劫。通关第七境「万劫归墟」后成就真仙，气血与法宝威力大幅提升；无需再刷一轮修为。' : r.locked ? `成仙瓶颈：须通关第七境「万劫归墟」。已积攒 ${r.progress} / ${r.needed} 修为，超额保留。` : `距下一境界还需 ${Math.max(0, r.needed - r.progress)} 修为，斩妖、升级实时积累，满额立即突破。`}</p><p><strong>当前入场气血 ${formatNumber(current.hp)}</strong><br>${current.weapon}基础伤害约 ${formatNumber(Math.round(current.weaponDamage))}${next ? `<br>${r.step === 23 ? '修为达标并通关七境后' : '下次突破后'}：气血 ${formatNumber(next.hp)}（+${formatNumber(next.hp - current.hp)}），本命基础伤害约 ${formatNumber(Math.round(next.weaponDamage))}（+${formatNumber(Math.round(next.weaponDamage) - Math.round(current.weaponDamage))}）` : ''}</p><small>按当前根基、炼器、宗门与药效估算新历练；本命按一重、未觉醒、非暴击计算，具体招式与敌方减伤另计。灵根主要影响修炼速度，境界越高，气血与伤害越强。</small></div></div>${spiritRootSummary()}${lifespanSummary()}<div class="realm-road">${REALMS.map((name, i) => `<div class="${i === r.index ? 'current' : i < r.index ? 'passed' : ''}"><span>${['一', '二', '三', '四', '五', '六', '七', '八', '九'][i]}</span><strong>${r.ascending && i === r.index ? '渡劫' : name}</strong></div>`).join('')}</div><div class="section-heading"><h3>修习根基</h3><div class="header-right">${currency()}</div></div><div class="training-grid">${(
        [
          {
            id: 'vitality',
            name: '淬体',
            icon: 'guard',
            desc: '每阶气血上限 +5%，满二十阶 +100%',
            detail: '筋骨如玉，百劫不摧',
          },
          {
            id: 'power',
            name: '悟道',
            icon: 'power',
            desc: `每阶独立增伤 +${spiritRootInfo(save.spiritRoot).powerPerLevel}%`,
            detail: `${spiritRootInfo(save.spiritRoot).name} · 当前增伤 +${Number((save.training.power * spiritRootInfo(save.spiritRoot).powerPerLevel).toFixed(1))}%`,
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
            `<article class="training-card">${icon(t.icon, '#cfcb9c')}<h3>${t.name}<small>${save.training[t.id]} / 20 阶</small></h3><p>${t.detail}</p><strong>${t.desc}</strong><button class="secondary-button" data-action="train" data-id="${t.id}" data-cost-stones="${trainingCost(save.training[t.id])}" ${save.training[t.id] >= 20 || lifespanInfo(save).remaining <= trainingYears(save) + 1e-9 ? 'disabled' : ''}>${save.training[t.id] >= 20 ? '修习圆满' : lifespanInfo(save).remaining <= trainingYears(save) + 1e-9 ? '寿元不足' : `修炼 · ${trainingCost(save.training[t.id])} 灵石 · ${trainingYears(save)} 年`}</button></article>`,
        )
        .join(
          '',
        )}</div><p class="panel-note">修习根基每阶消耗 ${trainingYears(save)} 年岁（${spiritRootInfo(save.spiritRoot).name}），资质越高修炼越快；寿元不足不扣资源。悟道各阶增伤相加后独立生效，不被境界与功法稀释；前十阶费用保持，后十阶涨幅放缓，单项修满共需 47373 灵石。斩妖与升级的修为实时入账，突破立即生效。通关额外修为、灵石和玄铁在历练结束时结算，失败也有收益。</p>${retreatSection()}<div class="save-record"><div class="save-record-copy"><h3>此世存档</h3><p>把这一世的修为、旧事与未尽历练收进行囊，日后仍可续上仙途。</p><small>本地保存为 JSON，不会上传。</small></div><div class="save-actions"><button class="secondary-button" data-action="export-save">导出此世</button><button class="secondary-button" data-action="import-save">导入旧档</button><input id="save-import" type="file" accept=".json,application/json" hidden></div></div>`,
      true,
    );
  } else if (panel === 'chronicle') {
    panelFrame(
      '仙途履历',
      '岁月留痕 · 此世道果',
      chronicleContent(save) +
        '<button class="secondary-button journey-card-entry" data-action="journey-card">留存此世</button>',
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
      volley: '散射 · 穿过弹幕间隙',
      nova: '环射 · 保持距离，寻找缺口',
      shield: '护盾 · 亮盾时减伤 55%，暗盾时集中攻击',
    };
    panelFrame(
      '知妖性，方能破万劫',
      '妖物志',
      `<p class="panel-note">前六境各有 12 种专属妖物，共 72 种；普通秘境只出现本境妖物。下面普通与精英技能说明适用于前六境，切换终关可查看其原有行为。每关分四批加入强敌：前六境按时长 0%、25%、50%、75% 解锁，终关提前到 0:00、0:45、1:30、2:30，后续以新批次为主。第七境「万劫归墟」汇聚历境精英，六位妖王与九天执劫仙尊依次登场；全部击败才能通关并解除成仙瓶颈。</p><div class="guide-tabs bestiary-tabs" role="group" aria-label="秘境妖物池">${[{ name: '全部', id: -1 }, ...STAGES.map((stage, id) => ({ name: stage.name, id }))].map((stage) => `<button data-action="bestiary-stage" data-id="${stage.id}" class="${bestiaryStage === stage.id ? 'active' : ''}" aria-pressed="${bestiaryStage === stage.id}">${stage.name}</button>`).join('')}</div><div class="bestiary-grid">${ENEMIES.filter(
        (_, index) => bestiaryStage < 0 || STAGE_ENEMIES[bestiaryStage].includes(index),
      )
        .map((e) => {
          const tactics = ENEMY_TACTICS[ENEMIES.indexOf(e)];
          const skill = tactics.skill && ENEMY_SKILLS[tactics.skill];
          const elite = tactics.eliteSkill && ENEMY_SKILLS[tactics.eliteSkill];
          const detail =
            bestiaryStage === FINAL_TRIAL_STAGE
              ? behavior[e.behavior]
              : `${tactics.flank ? '包抄 · 两翼绕行，近身合围' : e.behavior === 'shield' ? '护盾 · 亮盾减伤 55%，暗盾时反击；近身震地' : skill ? `${skill.name} · ${skill.hint}` : behavior[e.behavior]}<small class="enemy-skill">精英：${elite ? `${elite.name} · ${elite.eliteHint}` : behavior[e.behavior]}</small>`;
          return `<article class="enemy-card"><span class="sprite-thumb ${e.sprite >= 8 ? 'extra-sprite' : ''}" style="${spriteStyle(e.sprite)}"></span><div><h3>${e.name}</h3><p class="${bestiaryStage === FINAL_TRIAL_STAGE ? '' : 'enemy-detail'}">${detail}</p><small>${bestiaryStage === FINAL_TRIAL_STAGE ? '终关以精英形态出现 · ' : ''}基础气血 ${e.hp} · 伤害 ${e.damage}</small></div></article>`;
        })
        .join(
          '',
        )}</div><h3 class="guide-subheading">历境妖王与执劫仙尊</h3><div class="bestiary-grid">${STAGES.filter(
        (_, index) =>
          bestiaryStage < 0 ||
          (bestiaryStage === FINAL_TRIAL_STAGE && TRIAL_BOSS_STAGES.includes(index)) ||
          index === bestiaryStage,
      )
        .map(
          (stage) =>
            `<article class="enemy-card"><span class="sprite-thumb" style="${spriteStyle(stage.sprite)}"></span><div><h3>${stage.boss}</h3><p>${bestiaryStage === FINAL_TRIAL_STAGE ? `第 ${TRIAL_BOSS_STAGES.indexOf(STAGES.indexOf(stage)) + 1} 劫 · 最早 ${formatTime(TRIAL_BOSS_TIMES[TRIAL_BOSS_STAGES.indexOf(STAGES.indexOf(stage))])} 后现身` : `${stage.name} · ${stage.minutes} 分钟后现身`}</p><small>${stage.skills.join(' · ')}<br>半血后攻势加快</small></div></article>`,
        )
        .join(
          '',
        )}</div><div class="boss-note">${smallIcon('book')} 前六位首领各有三招，最终仙尊有六招交替施放，半血后攻势加快。冲刺与落地法阵有预警，及时横移；召唤物优先清理。终关第二批阶段开始追击精英追加冲刺，远程怪后期施法更快。</div>`,
      true,
    );
  } else if (panel === 'guide') {
    panelFrame(
      '修行指南',
      '道法有迹',
      `<div class="guide-tabs" role="group" aria-label="说明分类">${GUIDE_TABS.map((t) => `<button data-action="guide-tab" data-id="${t.id}" class="${guideTab === t.id ? 'active' : ''}" aria-pressed="${guideTab === t.id}">${t.title}</button>`).join('')}</div>${guideTab === 'mortal' ? '<h3 class="guide-subheading">青岚故居</h3><p class="panel-note">首次序章可选「跳过开场」直接看命盘，或选「入此山河」从故居告别、自动前往渡口，离乡后再看命盘。两条路线不影响灵根和物资。离乡不计龄，刷新保留阶段。此后入镇从故居门前开始，不强制交谈。父母随年岁老去，交谈无任务或奖励，家事和家书可在履历与缘簿重读。轮回默认直接命盘；想从头体验，可在洞府轮回确认时勾选「重走十五岁那一程」，仍会清空本世进度。命盘重抽保持快捷，圆满终章保留故乡选择。重温序章只重看文字，不清档。</p>' : ''}${guideContent(guideTab)}<button class="primary-button guide-close" data-action="close">${game ? '返回暂停界面' : '道心已明'} ${smallIcon('arrow')}</button>`,
    );
  }
}
function renderHud() {
  if (!game) return;
  document.body.classList.remove('immortal-home');
  lastLoadout = '';
  document.body.classList.add('in-game');
  ui.innerHTML = `<div class="game-hud"><div class="player-panel"><div class="player-heading"><span id="realm-name">${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name}</span><b id="level" title="局内等级：收集灵气升级，选择法宝与功法">LV. 1</b></div><div class="health-label"><span>气血</span><span id="health-text">100 / 100</span></div><div class="health-bar"><i id="health-fill"></i></div><div class="cultivation-label"><span id="cultivation-text"></span><span>实时修为</span></div><div id="lifespan-text" class="lifespan-hud"></div><small id="medicine-hud"></small></div><div class="stage-timer"><div>${game.encounterName} · ${pathInfo(game.path).name}<i>·</i>${DIFFICULTIES[game.difficulty].name}</div><strong id="time">00:00</strong><span> / ${game.tribulation ? '渡劫中' : formatTime(STAGES[game.stage].minutes * 60)}</span><small id="wave-label">初入秘境 · 稳固道心</small></div><div class="combat-actions"><span class="kill-counter">斩妖 <b id="kills">0</b></span>${controls(true)}</div></div><div id="boss-bar" class="boss-bar" hidden><div><span>${STAGES[game.stage].boss}</span><small>妖王</small></div><div class="health-bar"><i></i></div></div><div id="notice" class="battle-notice"></div><div class="battle-bottom"><div class="battle-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键</span><small><kbd>E</kbd> 开启自动历练 · 触屏拖动 · 自动施法</small></div><div class="equipped-slots" id="equipped-slots"></div><div class="battle-objective"><span id="xp-text">灵气 0 / 20</span><small>${game.tribulation ? '避开劫雷 · 反击核心' : game.isFinalTrial ? '全员精英 · 决战仙尊' : '存活历练 · 斩灭妖王'}</small></div></div><div class="passive-slots" id="passive-slots"></div><div class="xp-track"><i id="xp-fill"></i></div>`;
  updateHud();
}
let lastLoadout = '';
function updateHud() {
  if (!game) return;
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  };
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
  set('realm-name', realm.name);
  set(
    'cultivation-text',
    realm.max
      ? '真仙 · 长生久视'
      : realm.ascending
        ? '渡劫待成仙 · 需通关第七境'
        : realm.locked
          ? '成仙瓶颈 · 积攒修为并通关第七境'
          : `${realm.progress} / ${realm.needed}`,
  );
  set('level', `LV. ${game.level}`);
  set(
    'medicine-hud',
    activeMedicines(save.medicine, save.age)
      .map((m) => `${m.name} ${Math.max(0, save.medicine.active[m.id] - save.age).toFixed(0)}年`)
      .join(' · '),
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
  notice.textContent = game.noticeTime > 0 ? game.notice : '';
  notice.classList.toggle('visible', game.noticeTime > 0);
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
  modal.innerHTML = `<div class="modal-backdrop upgrade-backdrop"><section class="upgrade-panel" role="dialog" aria-modal="true" aria-label="局内升级，选择一项机缘"><div class="upgrade-heading"><span class="eyebrow">灵气充盈 · 道法自成</span><h2>顿悟新机缘</h2><p>局内等级 <b>${game.level}</b> <span>·</span> 选择一项，续写你的修行之路</p></div><div class="choice-grid">${game.choices.map((c, i) => choiceCard(c, i)).join('')}</div><div class="upgrade-footer"><span>法宝 ${game.weapons.length} / 6 <i>·</i> 功法 ${Object.keys(game.passives).length} / 4</span><button class="secondary-button" data-action="reroll" ${game.rerolls === 0 ? 'disabled' : ''}>${smallIcon('refresh')}重悟机缘 <span>${game.rerolls} / 3</span></button>${autoplayButton()}<small>${save.autoplay ? '自动历练正在挑选适合当前搭配的机缘…' : '按 1 / 2 / 3 选择'}</small></div></section></div>`;
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
            desc: `恢复 ${game?.isFinalTrial ? 15 : 40}% 最大气血，并获得 1 枚玄铁。`,
            id: 'duration',
          }
        : treasure(c.id);
  const tag =
    c.type === 'evolve'
      ? '仙器觉醒'
      : c.type === 'passive'
        ? `${pathInfo(passive(c.id).school).name}功法`
        : c.type === 'heal'
          ? '修行馈赠'
          : c.level === 1
            ? `${pathInfo(treasure(c.id).school).name}法宝`
            : '法宝升阶';
  return `<button class="choice-card ${c.type === 'evolve' ? 'evolution-choice' : ''}" data-action="choose" data-id="${i}" style="--item-color:${item.color}"><div class="choice-top"><span>${tag}</span><kbd>${i + 1}</kbd></div><div class="choice-art">${icon(item.id, item.color)}</div><h3>${c.type === 'evolve' ? treasure(c.id).evolution : item.name}</h3><div class="choice-level">${c.type === 'evolve' ? '六重 → 仙器' : c.type === 'heal' ? '固本培元' : c.level === 1 ? '领悟 · 一重' : `${c.level - 1} 重 → ${c.level} 重`}</div><p>${c.type === 'evolve' ? '伤害大幅提升，施法更快，并强化法术形态。' : item.desc}</p>${c.type === 'weapon' || c.type === 'evolve' ? weaponAffinity(treasure(c.id), game!.spiritRoot, game!.rootElements) + evolutionRecipe(treasure(c.id), game!.path) : ''}<div class="choice-benefit">${c.type === 'weapon' ? '配方齐备后，升级可选仙器觉醒' : c.type === 'passive' ? masteryDescription(save, c.id) || '功效按重数叠加' : c.type === 'evolve' ? '仙器之力，尽破妖潮' : '恢复状态，继续修行'}</div><span class="choice-select">领悟此法 ${smallIcon('arrow')}</span></button>`;
}
function renderPause() {
  if (!game) return;
  panelFrame(
    '静心片刻',
    '修行暂歇',
    `<p class="pause-description">${game.encounterName} · ${pathInfo(game.path).name} · ${formatTime(game.time)} · 已斩 ${game.kills} 妖</p><div class="pause-build">${game.weapons.map((w) => `<span>${icon(w.id, treasure(w.id).color)}${w.evolved ? treasure(w.id).evolution : treasure(w.id).name} · ${w.level}重 ${weaponAffinity(treasure(w.id), game!.spiritRoot, game!.rootElements, true)}</span>`).join('')}</div><p class="panel-note">${game.tribulation ? '放弃本次天劫会强制轮回，清空这一世进度。' : abandonConfirm ? '提前结束将按当前战绩结算收益，本次不会解锁下一秘境。' : '呼吸之间，万念归一。准备好后继续前行。'}</p><div class="pause-actions">${autoplayButton()}<button class="secondary-button" data-action="damage">伤害统计</button><button class="primary-button" data-action="resume">继续修行 ${smallIcon('play')}</button><button class="secondary-button" data-action="abandon">${game.tribulation ? '放弃渡劫 · 轮回' : abandonConfirm ? '确认结束并结算' : '结束本次历练'}</button></div>`,
  );
}
function gameEvent(name: string) {
  sound(name);
  if (name === 'loot') persist();
}
function damageReport() {
  if (!game) return '';
  const total = game.damageDealt;
  const rows = game.weapons.map((w) => {
    const item = treasure(w.id);
    return {
      id: w.id as string,
      name: w.evolved ? item.evolution : item.name,
      color: item.color,
      damage: game!.damageBySource[w.id] || 0,
    };
  });
  if (game.damageBySource.bone)
    rows.push({
      id: 'bone',
      name: '白骨魔甲 · 反伤',
      color: passive('bone').color,
      damage: game.damageBySource.bone,
    });
  const other = Math.max(0, total - rows.reduce((sum, row) => sum + row.damage, 0));
  if (other > 0.01)
    rows.push({ id: '', name: '其他 / 旧记录未分类', color: '#a7bbae', damage: other });
  rows.sort((a, b) => b.damage - a.damage);
  return `<section class="damage-report" aria-label="本局伤害统计"><div class="damage-heading"><h3>法宝伤害占比</h3><span>总伤害 ${formatNumber(Math.round(total))}</span></div>${rows
    .map((row) => {
      const percent = total > 0 ? (row.damage / total) * 100 : 0;
      return `<div class="damage-row" style="--damage-color:${row.color}">${row.id ? icon(row.id, row.color) : '<span class="damage-other">✧</span>'}<div class="damage-detail"><div class="damage-label"><strong>${row.name}</strong><span>${formatNumber(Math.round(row.damage))} <b>${percent.toFixed(1)}%</b></span></div><div class="damage-bar"><i style="width:${percent}%"></i></div></div></div>`;
    })
    .join(
      '',
    )}<p class="panel-note">按实际扣血统计，不含击杀时的溢出伤害；反伤单列。${other > 0.01 ? '旧版对局已造成的伤害无法追溯法宝归属。' : ''}</p></section>`;
}
function finishRun() {
  if (game?.tribulation) {
    if (game.state === 'won') finishTribulation();
    else if (game.state === 'lost') renderTribulationForfeit();
    return;
  }
  if (!game || settled || (game.state !== 'won' && game.state !== 'lost')) return;
  if (game.expired) {
    renderLifespanEnd();
    return;
  }
  clearInterval(adTimer);
  adReadyAt = 0;
  panel = '';
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
    combatCultivation: game.combatCultivation,
    spiritRoot: game.spiritRoot,
    path: game.path,
    startedImmortal: game.startedImmortal,
  });
  persist();
  if (game.state === 'won') {
    selectedStage = Math.min(STAGES.length - 1, game.stage + 1);
    // 结算时预载，返回首页已选中下一境；失败时由正式入场流程提供重试。
    void renderer
      .prepareScene(
        selectedStage,
        false,
        [],
        () => {},
        save.completed.includes(FINAL_TRIAL_STAGE) ? ['/assets/qinglan-prologue.webp'] : [],
      )
      .catch(() => {});
    renderVictory();
  } else renderResult();
}
function renderVictory() {
  if (!game || !rewards) return;
  panel = 'victory';
  const final = game.isFinalTrial;
  modal.innerHTML = `<div class="modal-backdrop victory-backdrop ${final ? 'victory-final' : ''}"><section class="victory-scene" role="dialog" aria-modal="true" aria-labelledby="victory-title"><div class="victory-formation" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="victory-sword" style="--angle:${i * 45}deg"><i class="victory-blade"></i></span>`).join('')}</div><div class="victory-sparks" aria-hidden="true">${Array.from(
    { length: 24 },
    (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const distance = 35 + (i % 4) * 6;
      return `<i style="--x:${Math.cos(angle) * distance}vmin;--y:${Math.sin(angle) * distance}vmin;--delay:${(i % 4) * 90}ms"></i>`;
    },
  ).join(
    '',
  )}</div><div class="victory-copy"><div class="eyebrow">${game.encounterName} · 历练圆满</div><h2 id="victory-title">${final ? '七劫尽破' : '一剑荡妖尘'}</h2><p>${final ? '七境圆满 · 天劫自此消散' : '妖王伏诛 · 此境已破'}</p>${final ? '<div class="victory-trials" aria-label="七劫全部完成">壹 · 贰 · 叁 · 肆 · 伍 · 陆 · 柒</div>' : ''}</div><button class="secondary-button victory-skip" data-action="victory-result">查看通关战绩 ${smallIcon('arrow')}</button></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  victoryTimer = window.setTimeout(() => {
    if (panel === 'victory') renderResult();
  }, 3000);
}
function renderDeath() {
  if (!game || game.state !== 'lost' || settled) return;
  if (game.expired) {
    renderLifespanEnd();
    return;
  }
  if (game.revivesUsed >= MAX_REVIVES) {
    finishRun();
    return;
  }
  panel = 'death';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="重燃道心"><div class="eyebrow">仙途未尽</div><h2>重燃道心</h2><p>观看广告后原地满血复活，获得 3 秒护体。<br>每局最多复活 ${MAX_REVIVES} 次，法宝、等级和战绩全部保留。${game.tribulation ? '<br>放弃本次天劫后可先留存此世，再确认轮回。' : ''}</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-ad">看广告复活 · 剩余 ${MAX_REVIVES - game.revivesUsed} 次</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 此世落幕' : '直接结算'}</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function showReviveAd() {
  if (
    !game ||
    game.state !== 'lost' ||
    game.revivesUsed >= MAX_REVIVES ||
    settled ||
    panel === 'revive-ad'
  )
    return;
  panel = 'revive-ad';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="复活广告"><div class="eyebrow">复活机缘</div><div class="revive-ad">广告位招租</div><p>观看结束即可重返秘境。</p><div class="result-actions death-actions"><button class="primary-button" data-action="ad-revive" disabled>5 秒后可复活</button><button class="secondary-button" data-action="finish-run">${game.tribulation ? '放弃渡劫 · 此世落幕' : '放弃复活并结算'}</button></div></section></div>`;
  startAdCountdown('ad-revive', '满血复活');
}
function startAdCountdown(action: string, label: string) {
  adReadyAt = Date.now() + 5000;
  clearInterval(adTimer);
  adTimer = window.setInterval(() => {
    if (!refreshAdCountdown(action, label)) clearInterval(adTimer);
  }, 200);
}
function refreshAdCountdown(action: string, label: string) {
  const button = modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) return 0;
  const seconds = Math.max(0, Math.ceil((adReadyAt - Date.now()) / 1000));
  const incomplete = rewardAd === 'root' && adElements.length !== spiritRootInfo(adRoot).count;
  button.disabled = seconds > 0 || incomplete;
  button.textContent =
    seconds > 0
      ? `${seconds} 秒后${label}`
      : incomplete
        ? '请选满对应数量的五行'
        : `广告已结束 · ${label}`;
  return seconds;
}
function renderRootPicker() {
  const container = modal.querySelector('#root-picker');
  if (!container) return;
  const root = spiritRootInfo(adRoot);
  container.innerHTML = `<div class="root-quality-options" role="group" aria-label="灵根资质">${SPIRIT_ROOTS.map((r) => `<button class="secondary-button ${r.id === adRoot ? 'selected' : ''}" data-action="ad-root-quality" data-id="${r.id}" aria-pressed="${r.id === adRoot}">${r.name}${r.count > 1 ? `·${r.count}系` : ''}</button>`).join('')}</div><p>选择 ${root.count} 种五行 · 已选 ${adElements.length} / ${root.count} · 对应法宝伤害 +${root.damageBonus}%<br>灵气与修为 ${Math.round(root.rate * 100)}%，基础气血 ${root.baseHp}，基础回血 ${root.baseRegen.toFixed(2)}/秒，悟道每阶独立增伤 +${root.powerPerLevel}%。<br>基础暴击 ${Math.round(root.baseCrit * 100)}% · 基础移速 ${root.baseSpeed} 地图像素/秒。<br>${root.count ? '首位五行决定默认本命。' : '本命法宝将在领取时随机。'}</p><div class="root-element-options" role="group" aria-label="灵根五行">${ELEMENTS.map((e) => `<button class="secondary-button ${adElements.includes(e.id) ? 'selected' : ''}" data-action="ad-root-element" data-id="${e.id}" aria-pressed="${adElements.includes(e.id)}" ${root.count ? '' : 'disabled'}>${e.name}${adElements[0] === e.id ? ' · 首位' : ''}</button>`).join('')}</div><small>${root.count ? `入门法宝：${ROOT_STARTERS[adElements[0] ?? 'metal'].map((id) => treasure(id).name).join(' / ')}` : `入门法宝：从${save.path === 'dual' ? '正魔十件' : '本门五件'}中随机`}；领取后设为当前路线本命，已有收藏与炼器保留。</small>`;
}
function rememberRewardReturn() {
  rewardReturnPanel = panel;
  rewardReturnScroll = modal.querySelector('.panel')?.scrollTop ?? 0;
}
function renderSectDues() {
  if (!sectDuesPending(save)) return;
  const dues = save.mortal.member!.dues;
  panel = 'sect-dues';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="宗门供奉到期"><div class="eyebrow">仙门供奉</div><h2>供奉到期</h2><p>本期需 ${dues} 灵石，现有 ${save.stones} 灵石。${save.stones < dues ? `<br>还缺 ${dues - save.stones} 灵石，可看广告领取 ${AD_SUPPLIES.stones} 灵石与 ${AD_SUPPLIES.iron} 玄铁。` : '<br>物资已足，可以补缴。'}</p><p class="panel-note">人间计时已暂停，在籍身份与精研保留。一次不足可再次领取；放弃补缴会被清退出宗门。</p><div class="result-actions death-actions">${save.stones < dues ? '<button class="primary-button" data-action="dues-ad">看广告 · 领取物资</button>' : '<button class="primary-button" data-action="dues-pay">补缴供奉 · 继续游历</button>'}<button class="secondary-button" data-action="dues-decline">放弃补缴 · 离开宗门</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('button')?.focus();
}
function showSuppliesShortage(stones: number, iron: number) {
  if (game || (save.stones >= stones && save.iron >= iron)) return false;
  rememberRewardReturn();
  const missing = [
    stones > save.stones ? `${stones - save.stones} 灵石` : '',
    iron > save.iron ? `${iron - save.iron} 玄铁` : '',
  ]
    .filter(Boolean)
    .join('、');
  panel = 'supplies-shortage';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="物资不足"><div class="eyebrow">修行资粮</div><h2>物资不足</h2><p>本次操作还缺 ${missing}。</p><p class="panel-note">当前持有 ${save.stones} 灵石、${save.iron} 玄铁。<br>可观看 5 秒广告，领取 ${AD_SUPPLIES.stones} 灵石与 ${AD_SUPPLIES.iron} 玄铁。领取后返回原页面，再选择要进行的操作。</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-supplies-ad">看广告 · 领取物资</button><button class="secondary-button" data-action="cancel-supplies">暂不领取</button></div></section></div>`;
  modal.querySelector<HTMLButtonElement>('[data-action="cancel-supplies"]')?.focus();
  return true;
}
function showRewardAd(kind: 'root' | 'supplies') {
  if (game || rewardAd) return;
  if (panel !== 'supplies-shortage') rememberRewardReturn();
  rewardAd = kind;
  adRoot = 'heaven';
  adElements = rootElementsFor(adRoot, save.rootElements);
  panel = 'reward-ad';
  const reward =
    kind === 'root'
      ? '自选灵根资质与五行，解锁对应入门法宝。后续新历练生效，未完成的历练保留原来的灵根和武器。'
      : `领取 ${AD_SUPPLIES.stones} 灵石与 ${AD_SUPPLIES.iron} 玄铁，可再次观看领取。`;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel ${kind === 'root' ? 'root-ad-panel' : ''}" role="dialog" aria-modal="true" aria-label="仙缘广告"><div class="eyebrow">${kind === 'root' ? '自选灵根' : '仙缘补给'}</div><div class="revive-ad">广告位招租</div><p>${reward}<br>完整观看 5 秒后点击领取，中途离开不发放奖励。</p>${kind === 'root' ? '<div id="root-picker"></div>' : ''}<div class="result-actions death-actions"><button class="primary-button" data-action="claim-ad-reward" disabled>5 秒后领取奖励</button><button class="secondary-button" data-action="cancel-reward-ad">放弃领取</button></div></section></div>`;
  if (kind === 'root') renderRootPicker();
  startAdCountdown('claim-ad-reward', '领取奖励');
  modal
    .querySelector<HTMLButtonElement>('[data-action="cancel-reward-ad"]')
    ?.focus({ preventScroll: true });
}
function closeRewardAd() {
  clearInterval(adTimer);
  adReadyAt = 0;
  rewardAd = null;
  panel = '';
  modal.innerHTML = '';
  if (inMortalWorld) renderMortal();
  else renderLobby();
  if (rewardReturnPanel) {
    if (rewardReturnPanel === 'sect-dues') renderSectDues();
    else if (rewardReturnPanel === 'town-event' && townNpc) showTownEvent(townNpc);
    else showPanel(rewardReturnPanel);
    modal.querySelector('.panel')?.scrollTo(0, rewardReturnScroll);
  }
}
function renderResult() {
  if (!game || !rewards) return;
  window.clearTimeout(victoryTimer);
  panel = '';
  const won = game.state === 'won',
    realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name;
  const firstReturn = save.mortal.hometown && save.runs === 1 && !game.tribulation;
  const journeyYears =
    game.elapsedYears === undefined
      ? '此行年岁未载'
      : game.elapsedYears < 0.1
        ? '此行不足 0.1 年'
        : firstReturn
          ? `此行 ${game.elapsedYears.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 年<br>离乡时十五，如今 ${save.age.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 岁。`
          : `此行 ${game.elapsedYears.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })} 年`;
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel ${won && game.isFinalTrial ? 'result-complete' : ''}" role="dialog" aria-modal="true" aria-label="历练结算"><div class="result-seal">${won ? (game.isFinalTrial ? '圆满' : '破境') : '归来'}</div><div class="eyebrow">${game.encounterName} · ${pathInfo(game.path).name} · ${DIFFICULTIES[game.difficulty].name}</div><h2>${won ? (game.isFinalTrial ? '仙途圆满，自在长生' : '一剑荡妖尘') : '仙途漫漫，再行一程'}</h2><p>${won ? (game.isFinalTrial ? '七境已破，周期天劫就此止息。修为达标即可突破真仙，既有修行与劫印长存。' : `妖王已斩，${STAGES[game.stage + 1].name}已解锁。`) : '胜败皆为修行。此行所得，尽归道心。'}</p><div class="result-stats"><div><strong>${formatTime(game.time)}</strong><span>历练时长</span></div><div><strong>${game.kills}</strong><span>斩妖数量</span></div><div><strong>${game.level}</strong><span>局内等级</span></div></div><div class="reward-row"><span>${smallIcon('gem')}<b>+${rewards.stones}</b> 灵石</span><span>◆ <b>+${rewards.iron}</b> 玄铁</span><span>✧ <b>+${rewards.cultivation}</b> 本局修为</span></div><p class="result-years">${journeyYears}</p><p class="panel-note">修为实时入账 ${rewards.cultivation - rewards.cultivationRemaining} · 本次补发 ${rewards.cultivationRemaining}，合计已计入永久修为。</p><div class="result-realm">${realm !== oldRealm ? `境界突破 · ${oldRealm} → ${realm}` : `当前境界 · ${realm}`}</div>${game.bossCultivation > 0 ? `<p class="boss-reward">妖王突破修为 +${Math.floor(game.bossCultivation).toLocaleString('zh-CN', { useGrouping: false })}<small>已计入本局总修为</small></p>` : ''}${damageReport()}<div class="result-actions"><button class="secondary-button" data-action="return">返回洞府</button><button class="primary-button" data-action="${won && game.stage < STAGES.length - 1 ? 'next' : 'retry'}">${won && game.stage < STAGES.length - 1 ? '前往下一秘境' : '再入仙途'} ${smallIcon('arrow')}</button></div></section></div>`;
  modal.querySelector('.result-years')?.insertAdjacentHTML('afterend', runLootContent(game.loot));
  if (won && game.isFinalTrial) modal.querySelector('[data-action="retry"]')?.remove();
  modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
function ensureScene(stage: number, next: () => void, run?: Game | null, tribulation = false) {
  const extra =
    run?.enemies.map((e) =>
      e.boss ? STAGES[e.bossStage ?? run.stage].sprite : ENEMIES[e.type].sprite,
    ) ?? [];
  const isTribulation = tribulation || !!run?.tribulation;
  const extraImages = [
    window.matchMedia('(max-width: 640px)').matches ? JOURNEY_MAP_MOBILE_IMAGE : JOURNEY_MAP_IMAGE,
    ...(save.prologueSeen ? [] : [PROLOGUE_IMAGE]),
  ];
  if (realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max)
    extraImages.push('/assets/qinglan-prologue.webp');
  if (renderer.hasScene(stage, isTribulation, extra, extraImages)) return true;
  if (sceneLoading) return false;
  sceneLoading = true;
  const loading = document.createElement('div');
  loading.className = 'scene-loading';
  loading.setAttribute('role', 'dialog');
  loading.setAttribute('aria-label', '场景资源加载');
  loading.setAttribute('aria-modal', 'true');
  loading.innerHTML = `<section><div class="eyebrow">叩仙门：青岚纪</div><h2>${isTribulation ? '天劫将至' : STAGES[stage].name}</h2><p>正在准备地图、人物与法宝</p><progress max="1" value="0" aria-label="素材加载进度"></progress><p class="load-progress" role="status">0%</p><button class="secondary-button" hidden>重新加载</button></section>`;
  app.append(loading);
  let failed = false;
  renderer
    .prepareScene(
      stage,
      isTribulation,
      extra,
      (done, total) => {
        if (failed) return;
        const progress = loading.querySelector('progress')!;
        progress.max = total;
        progress.value = done;
        loading.querySelector('.load-progress')!.textContent =
          `${Math.round((done / total) * 100)}% · ${done} / ${total} 项资源`;
      },
      extraImages,
    )
    .then(() => {
      loading.remove();
      sceneLoading = false;
      assetsReady = true;
      next();
    })
    .catch(() => {
      failed = true;
      loading.querySelector('.load-progress')!.textContent =
        '素材加载失败，请检查网络后重试。尚未进入场景。';
      const retry = loading.querySelector('button')!;
      retry.hidden = false;
      retry.onclick = () => {
        loading.remove();
        sceneLoading = false;
        ensureScene(stage, next, run, tribulation);
      };
      retry.focus();
    });
  return false;
}
function startRun() {
  if (!assetsReady || selectedStage > save.unlocked) return;
  if (tribulationDue(save)) {
    renderTribulationPending();
    return;
  }
  if (pendingRun) {
    panel = 'restart';
    panelFrame(
      '另启一段仙缘',
      '上次历练尚未结束',
      '<p class="panel-note">新开历练会放弃尚未结算的那一局。已经获得的永久修为、灵石和炼器进度不受影响。</p><div class="pause-actions"><button class="secondary-button" data-action="restore">继续上次历练</button><button class="primary-button" data-action="new-run">放弃旧局并开始</button></div>',
    );
    return;
  }
  if (!ensureScene(selectedStage, startRun)) {
    void mobileDisplay.enter();
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
  game.onEvent = gameEvent;
  previousState = 'playing';
  oldRealm = realmInfo(
    save.cultivation - game.creditedCultivation,
    save.completed.includes(FINAL_TRIAL_STAGE),
  ).name;
  renderHud();
  void mobileDisplay.enter();
  if (save.sound) unlockAudio();
  persist();
}
function restoreRun() {
  if (!pendingRun || !assetsReady) return;
  if (!ensureScene(pendingRun.stage, restoreRun, pendingRun)) {
    void mobileDisplay.enter();
    return;
  }
  game = pendingRun;
  pendingRun = null;
  settled = false;
  rewards = null;
  abandonConfirm = false;
  selectedStage = game.stage;
  difficulty = game.difficulty;
  game.onEvent = gameEvent;
  clearInput();
  panel = '';
  previousState = game.state;
  oldRealm = realmInfo(
    save.cultivation - game.creditedCultivation,
    save.completed.includes(FINAL_TRIAL_STAGE),
  ).name;
  renderHud();
  void mobileDisplay.enter();
  if (game.state === 'upgrade') renderChoices();
  else if (game.state === 'lost') renderDeath();
  else renderPause();
  if (save.sound) unlockAudio();
  persist();
}
function returnLobby() {
  const years =
    game && settled && save.runs === 1 && !game.tribulation ? game.elapsedYears : undefined;
  game = null;
  panel = '';
  modal.innerHTML = '';
  previousState = '';
  clearInput();
  renderLobby(years);
}
function renderRootReveal(previousLife = '前尘已散，新一世从十五岁启程。', firstLife = false) {
  const starter = treasure(save.starter);
  panel = 'root-reveal';
  ui.inert = true;
  panelFrame(
    firstLife ? '命盘初现，始问长生' : '一念轮回，再问长生',
    '命盘初现 · 此世资质',
    `<p class="root-reveal-context">${previousLife}</p><div class="root-reveal-layout"><div class="root-reveal-disc">${spiritRootDiagram(true)}</div><div class="root-reveal-effects"><h3>${spiritRootInfo(save.spiritRoot).name}</h3><p>${spiritRootEffects()}</p></div><div class="root-reveal-aside"><div class="root-reveal-starter">${icon(starter.id, starter.color)}<div><small>本命法宝 · ${elementInfo(starter.element).name}系</small><strong>${starter.name}</strong></div></div><blockquote class="root-verdict"><span>命批</span><p>${ROOT_IMPRESSIONS[save.spiritRoot].verse}</p></blockquote></div></div><div class="root-reveal-actions"><button class="primary-button" data-action="accept-root">道心已明 ${smallIcon('arrow')}</button><button class="secondary-button" data-action="reroll-root">轮回转世</button></div>`,
    true,
  );
  modal.querySelector('[data-action="close"]')?.remove();
  const section = modal.querySelector<HTMLElement>('.panel')!;
  section.classList.add('root-reveal-panel');
  section.scrollTop = 0;
  section.tabIndex = -1;
  section.focus({ preventScroll: true });
}
function resetLifetime(previousLife?: string, revisitHometown: boolean | 'full' = false) {
  shownHumanLetters.clear();
  const root = rollSpiritRoot();
  clearInterval(adTimer);
  window.clearTimeout(victoryTimer);
  adReadyAt = 0;
  rewardAd = null;
  pendingImport = null;
  clearInput();
  game = null;
  pendingRun = null;
  rewards = null;
  const { sound: soundEnabled, volume, prologueSeen, hometownSeen } = save;
  Object.assign(save, freshSave(root, rootElementsFor(root), 'orthodox'), {
    sound: soundEnabled,
    volume,
    prologueSeen,
    hometownSeen,
  });
  if (revisitHometown === 'full') {
    save.prologueSeen = false;
    save.hometownSeen = false;
  } else if (!revisitHometown) {
    save.prologueSeen = true;
    departHometown(save);
  }
  unlockAudio();
  selectedStage = difficulty = treasurePage = 0;
  selectedTreasure = save.starter;
  schoolFilter = 'all';
  bookTab = 'treasures';
  persist();
  panel = '';
  modal.innerHTML = '';
  ui.inert = false;
  renderLobby();
  if (!save.prologueSeen) renderPrologue();
  if (previousLife) toast(previousLife);
}
function renderTribulationPending() {
  if (game) {
    game.pause();
    previousState = game.state;
  }
  clearInput();
  panel = 'tribulation-pending';
  panelFrame(
    '天劫将至',
    `第 ${save.tribulations + 1} 次天劫 · 两万年一劫`,
    `<p class="pause-description">当前历练已保存。渡劫场只有一位「天劫」，看清预警、侧移避雷，在核心显露时反击。</p><p class="panel-note">携带当前搭配；无未完成历练时，本命在渡劫场临时觉醒。渡劫期间不计龄、不掉经验或回血宝物。战败可使用本次天劫的 ${MAX_REVIVES} 次广告复活；放弃后可先留存此世，再确认轮回。</p><p class="boss-reward">渡劫成功：永久气血 +3% · 法宝伤害 +2%<small>劫印按次数累加，轮回清空；胜利后返回原历练。</small></p><div class="save-actions"><button class="primary-button" data-action="tribulation-start" ${assetsReady ? '' : 'disabled'}>${pendingRun?.tribulation ? '继续迎劫' : '迎战天劫'}</button><button class="secondary-button" data-action="tribulation-forfeit">放弃渡劫 · 此世落幕</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function beginTribulation() {
  if (!assetsReady || !tribulationDue(save)) return;
  if (pendingRun?.tribulation) {
    restoreRun();
    return;
  }
  if (!ensureScene(6, beginTribulation, null, true)) {
    void mobileDisplay.enter();
    return;
  }
  const source = game && !settled ? game : pendingRun;
  save.tribulationReturn = source?.snapshot() ?? null;
  game = Game.createTribulation(save, source);
  pendingRun = null;
  settled = false;
  rewards = null;
  abandonConfirm = false;
  panel = '';
  previousState = 'playing';
  modal.innerHTML = '';
  clearInput();
  game.onEvent = gameEvent;
  renderHud();
  void mobileDisplay.enter();
  lastFrame = performance.now();
  persist();
}
function renderTribulationForfeit() {
  if (game) {
    game.pause();
    previousState = game.state;
  }
  clearInput();
  panel = 'tribulation-forfeit';
  panelFrame(
    '弃劫即轮回',
    '确认放弃这一世修行',
    `<p class="pause-description">确认轮回后，境界、物资、法宝收藏、炼器、根基、劫印和已保存的原历练都会清空，并重新随机灵根。</p><p class="panel-note">${game?.tribulation && game.revivesUsed >= MAX_REVIVES ? '本次天劫的广告复活次数已用尽。' : '可以继续迎劫；已阵亡时可看广告复活。'}确认放弃后可先留存此世，再决定轮回。</p><div class="save-actions"><button class="secondary-button" data-action="cancel-forfeit">继续迎劫</button><button class="primary-button" data-action="confirm-forfeit">确认弃劫 · 此世落幕</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function finishTribulation() {
  if (!game?.tribulation || game.state !== 'won') return;
  const report = damageReport();
  if (!completeTribulation(save, game.tribulation)) return;
  resolveActivity(save);
  const original = save.tribulationReturn;
  save.tribulationReturn = null;
  pendingRun = Game.restore(save, original);
  game = null;
  settled = false;
  clearInput();
  persist();
  renderLobby();
  panel = 'tribulation-won';
  panelFrame(
    '天劫已破',
    `第 ${save.tribulations} 枚劫印 · 大道再进`,
    `<div class="result-seal">渡劫</div><p class="boss-reward">永久气血 +3% · 法宝伤害 +2%<small>累计气血 +${save.tribulations * 3}% · 伤害 +${save.tribulations * 2}% · 下一劫在 ${save.nextTribulationAge.toFixed(1)} 岁</small></p>${report}<button class="primary-button guide-close" data-action="${pendingRun ? 'restore' : 'home'}">${pendingRun ? '返回原历练' : '返回洞府'}</button>`,
  );
}
function endLifetime() {
  const life = lifespanInfo(save);
  const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name;
  resetLifetime(
    `前世止于${realm}，享年 ${life.age.toFixed(1)} 年。尘缘已了，今世从十五岁再启仙途。`,
  );
}
function renderJourneyFarewell(reason: NonNullable<SaveData['pendingReincarnation']>) {
  clearInput();
  const tribulation = reason === 'tribulation';
  panel = tribulation ? 'tribulation-farewell' : 'lifespan-farewell';
  panelFrame(
    tribulation ? '止于天劫' : '此世寿终',
    tribulation ? '劫雷未息 · 一生落笔' : '寿数已尽 · 一生落笔',
    `<div class="lifespan-story"><p>${tribulation ? '劫雷落尽，这一世的问道路止于仙关之前。' : '这一世已行至尽头。'}山河仍在，旧事、故人与求道路上的每一步，也都留在身后。</p><p>可将此世修行留作一幅纪念；无论是否留存，确认轮回后都将从十五岁重新启程。</p></div><div class="save-actions"><button class="secondary-button" data-action="journey-card">留存此世</button><button class="primary-button" data-action="confirm-journey-reincarnate">轮回转世 ${smallIcon('arrow')}</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function beginJourneyFarewell(reason: NonNullable<SaveData['pendingReincarnation']>) {
  const ended = structuredClone(save);
  ended.pendingReincarnation = reason;
  ended.autoplay = false;
  ended.tribulationReturn = null;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...ended, activeRun: null }));
  } catch {
    toast('浏览器无法保存本世落幕，请释放存储空间后重试');
    return;
  }
  Object.assign(save, ended);
  game = pendingRun = null;
  settled = false;
  renderLobby();
  renderJourneyFarewell(reason);
}
function renderLifespanEnd() {
  clearInput();
  panel = 'lifespan-ended';
  const life = lifespanInfo(save);
  panelFrame(
    '一生将尽，山河仍远',
    '寿元已尽 · 此世未了',
    `<div class="lifespan-story"><p>灵力渐渐散去，你抬起手，才看清指间不知何时添了这样深的纹路。走过的山川一一浮现，最后停在十五岁那年的青岚渡口——那时行囊很轻，你以为前路还长。</p><p>远处似有钟声。若心愿未了，便再向苍天借一程；若已倦了，来世的春风，也会吹过青岚。</p></div><p class="pause-description">此世行至${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name} · 年岁 ${life.age.toFixed(1)} / ${life.limit} 年。修行已暂停。</p><p class="panel-note">完整观看 5 秒广告可增加 ${Math.round(life.base * 0.3)} 年寿元（当前境界基础寿命的 30%），保留全部修行进度。选择不再借寿后，可先留存此世，再确认轮回。</p><div class="save-actions"><button class="primary-button" data-action="watch-lifespan-ad">向天再借五百年</button><button class="secondary-button" data-action="end-lifetime">不再借寿 · 此世落幕</button></div>`,
  );
  modal.querySelector('[data-action="close"]')?.remove();
}
function showLifespanAd() {
  const life = lifespanInfo(save);
  if (!Number.isFinite(life.base) || life.remaining > 0 || panel !== 'lifespan-ended') return;
  panel = 'lifespan-ad';
  modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="借寿广告"><div class="eyebrow">向天再借五百年</div><div class="revive-ad">广告位招租</div><p>本次增加 ${Math.round(life.base * 0.3)} 年寿元（基础寿命的 30%）。<br>再次寿尽时可再借，年数累加；突破后保留已借寿元。</p><div class="result-actions death-actions"><button class="primary-button" data-action="claim-lifespan" disabled>5 秒后借寿</button><button class="secondary-button" data-action="cancel-lifespan">暂不借寿</button></div></section></div>`;
  startAdCountdown('claim-lifespan', '领取寿元');
}
function clearInput() {
  keys.clear();
  touchInput = { x: 0, y: 0 };
  pointer = null;
  joystick.classList.remove('active');
  if (game) game.input = { x: 0, y: 0 };
}
function handleAction(action: string, id?: string) {
  if (save.journeyEnded) {
    if (action === 'journey-card' && (panel === 'epilogue' || panel === 'journey-card')) {
      void renderJourneyCard();
    } else if (action === 'close' && panel === 'journey-card') {
      renderEpilogue();
    } else if (action === 'epilogue-reincarnate' && panel === 'epilogue') {
      panel = 'epilogue-reincarnate';
      panelFrame(
        '再问长生',
        '轮回转世 · 开启新的一世',
        '<p class="pause-description">此世已在仙门前落幕。轮回将清空此世修为、年岁、法宝、物资与履历，重新抽取灵根，从十五岁启程。</p><div class="pause-actions"><button class="secondary-button" data-action="close">留在终章</button><button class="primary-button" data-action="confirm-reincarnate">确认轮回</button></div>',
      );
    } else if (action === 'confirm-reincarnate' && panel === 'epilogue-reincarnate') {
      ui.inert = false;
      resetLifetime('前世叩入仙门，已证长生。如今重回十五岁，再赴一程山河。', true);
    } else if (action === 'close' && panel === 'epilogue-reincarnate') renderEpilogue();
    else if (action === 'epilogue-sound' && panel === 'epilogue') {
      save.sound = !save.sound;
      unlockAudio();
      persist();
      updateStorySoundButton(
        modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!,
      );
    }
    return;
  }
  // 留影只切换面板，不能解除已结束的人生状态。
  if (save.pendingReincarnation) {
    if (action === 'journey-card') void renderJourneyCard();
    else if (action === 'close' && panel === 'journey-card')
      renderJourneyFarewell(save.pendingReincarnation);
    else if (
      action === 'confirm-journey-reincarnate' &&
      (panel === 'lifespan-farewell' || panel === 'tribulation-farewell')
    ) {
      if (panel === 'lifespan-farewell') endLifetime();
      else resetLifetime('前世止于天劫，旧缘已散。今世从十五岁，再问长生。');
    }
    return;
  }
  if (panel === 'root-reveal') {
    if (action === 'reroll-root') resetLifetime();
    else if (action === 'accept-root' || action === 'close') {
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      if (acceptHometownRoot(save)) persist();
      renderLobby();
      ui.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true });
    }
    return;
  }
  if (panel === 'prologue') {
    if (action === 'prologue-sound') {
      save.sound = !save.sound;
      unlockAudio();
      persist();
      updateStorySoundButton(
        modal.querySelector<HTMLButtonElement>('[data-action="prologue-sound"]')!,
      );
      return;
    }
    if (
      action === 'prologue-skip' &&
      !save.prologueSeen &&
      !pendingRun &&
      save.mortal.hometown &&
      ['farewell', 'walk'].includes(save.mortal.hometown.stage)
    ) {
      finishDeparture(true);
      return;
    }
    if (action === 'prologue-enter' || action === 'prologue-skip' || action === 'close') {
      const replay = save.prologueSeen;
      save.prologueSeen = true;
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      persist();
      renderLobby();
      if (replay)
        ui.querySelector<HTMLButtonElement>('[data-action="prologue-revisit"]')?.focus({
          preventScroll: true,
        });
    }
    return;
  }
  if (action === 'prologue-revisit') {
    renderPrologue(true);
    return;
  }
  if (
    save.mortal.hometown &&
    ['farewell', 'walk'].includes(save.mortal.hometown.stage) &&
    !save.pendingReincarnation &&
    !game &&
    !pendingRun &&
    lifespanInfo(save).remaining > 0 &&
    !tribulationDue(save)
  ) {
    if (action === 'hometown-walk' && panel === 'hometown-choice') renderDeparture();
    else if (action === 'hometown-skip' && panel === 'hometown-choice') finishDeparture();
    else if (action === 'hometown-continue' && panel === 'hometown-farewell') {
      save.mortal.hometown.stage = 'walk';
      persist();
      ui.inert = false;
      panel = '';
      modal.innerHTML = '';
      document.getElementById('town-view')?.focus({ preventScroll: true });
      townScene?.toggleDockNavigation();
    } else if (action === 'town-retry') renderDeparture();
    else if (action === 'town-talk' && !panel) townScene?.talk();
    if (action !== 'fullscreen') return;
  }
  if (action === 'hometown-home' && panel === 'hometown-home') {
    showHometown();
    return;
  }
  if (
    action === 'hometown-parent' &&
    panel === 'hometown-home' &&
    (id === 'father' || id === 'mother')
  ) {
    showHometown(id);
    return;
  }
  if (
    action === 'hometown-letter' &&
    inMortalWorld &&
    save.mortal.hometown?.letterFoundAt != null &&
    ['hometown-home', 'human-journal', 'human-memory', ''].includes(panel)
  ) {
    if (readHometownLetter(save)) persist();
    panel = 'human-memory';
    panelFrame('故居家书', '人间缘簿 · 家中旧字', hometownLetterContent(save));
    return;
  }
  if (
    action === 'immortal-gate' &&
    !game &&
    !inMortalWorld &&
    realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).max
  ) {
    panel = 'immortal-gate';
    panelFrame(
      '叩入仙门',
      '越过此门，此世落幕',
      '<p class="pause-description">确认后进入终章，此世将永久结束。历练、洞府和青岚镇均不可再返回，未完成的历练也会终止；刷新页面仍保留结束状态。</p><p class="panel-note">之后只能轮回转世，清空此世进度，从十五岁重新启程。也可暂留人间，待准备好再来。</p><div class="pause-actions"><button class="secondary-button" data-action="close">暂留人间</button><button class="primary-button" data-action="confirm-immortal-gate">叩门而入 · 结束此世</button></div>',
    );
    return;
  }
  if (action === 'confirm-immortal-gate' && panel === 'immortal-gate' && !game) {
    const ended = structuredClone(save);
    if (!enterImmortalGate(ended)) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...ended, activeRun: null }));
    } catch {
      toast('浏览器无法保存终章，此世尚未结束，请释放存储空间后重试');
      return;
    }
    Object.assign(save, ended);
    pendingRun = null;
    renderEpilogue();
    return;
  }
  if (action === 'fullscreen' && (game || inTown)) {
    void (mobileDisplay.active ? mobileDisplay.leave() : mobileDisplay.enter());
    return;
  }
  if (action === 'journey-map' && !game) {
    ui.querySelector<HTMLButtonElement>('.journey-node.selected')?.focus({ preventScroll: true });
    ui.querySelector('.journey-map-heading')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    return;
  }
  if ((action === 'revisit' || action === 'journey-prepare') && !game) {
    ui.querySelector<HTMLButtonElement>('.journey-depart [data-action="start"]')?.focus({
      preventScroll: true,
    });
    ui.querySelector('.journey-selection')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    return;
  }
  if (panel === 'tribulation-forfeit') {
    if (action === 'confirm-forfeit') {
      beginJourneyFarewell('tribulation');
    } else if (action === 'cancel-forfeit' || action === 'close') {
      if (game?.tribulation) game.state === 'lost' ? renderDeath() : renderPause();
      else renderTribulationPending();
    }
    return;
  }
  if (action === 'tribulation-start' && tribulationDue(save)) {
    beginTribulation();
    return;
  }
  if (action === 'tribulation-forfeit' && tribulationDue(save)) {
    renderTribulationForfeit();
    return;
  }
  if (tribulationDue(save) && !game?.tribulation) {
    renderTribulationPending();
    return;
  }

  if (panel === 'lifespan-ended' && !['watch-lifespan-ad', 'end-lifetime'].includes(action)) return;
  if (
    action === 'end-lifetime' &&
    panel === 'lifespan-ended' &&
    lifespanInfo(save).remaining === 0
  ) {
    beginJourneyFarewell('lifespan');
    return;
  }
  if (action === 'watch-lifespan-ad') {
    showLifespanAd();
    return;
  }
  if (panel === 'lifespan-ad' && ['close', 'cancel-lifespan', 'claim-lifespan'].includes(action)) {
    const claim = action === 'claim-lifespan';
    if (claim && (!adReadyAt || Date.now() < adReadyAt)) return;
    const target = game ?? pendingRun;
    const years = claim ? (target ? target.borrowLife() : extendLifespan(save)) : 0;
    if (years) resolveActivity(save);
    clearInterval(adTimer);
    adReadyAt = 0;
    persist();
    if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
    else if (game) {
      panel = '';
      previousState = game.state;
      renderPause();
      updateHud();
    } else {
      panel = '';
      modal.innerHTML = '';
      renderLobby();
    }
    if (years) toast(`向天借寿 · 寿元 +${years} 年`);
    return;
  }
  if (panel === 'sect-dues') {
    if (action === 'dues-ad') showRewardAd('supplies');
    else if (action === 'dues-pay' || action === 'dues-decline') {
      if (!settleSectDues(save, action === 'dues-decline')) return;
      panel = '';
      modal.innerHTML = '';
      persist();
      if (inMortalWorld) syncMortalChange();
      else renderLobby();
      toast(action === 'dues-pay' ? '供奉已补缴，继续游历' : '已离宗，精研成果仍保留');
    }
    return;
  }
  if (action === 'mortal-enter' && !game) {
    if (lifespanInfo(save).remaining === 0) {
      renderLifespanEnd();
      return;
    }
    renderMortal(true);
    persist();
    return;
  }
  if (
    action === 'smith-story' &&
    panel === 'town-event' &&
    inTown &&
    !game &&
    townNpc?.id === 'smith'
  ) {
    if (townScene?.nearbyNpc?.id === 'smith' && chooseSmithStory(save, id ?? '')) {
      persist();
      showTownEvent(townNpc);
      toast(save.mortal.events[0]);
    }
    return;
  }
  if (
    action === 'human-memory' &&
    inMortalWorld &&
    !game &&
    (!panel || panel === 'human-journal') &&
    id &&
    isHumanStoryId(id) &&
    save.mortal.humanStories?.[id]
  ) {
    syncHumanStories(save);
    chooseHumanStory(save, id, 'read');
    persist();
    panel = 'human-memory';
    panelFrame(HUMAN_STORIES[id].title, '人间缘簿 · 此世旧事', humanStoryContent(save, id));
    return;
  }
  if (action === 'human-story' && inMortalWorld && !game) {
    const [storyId, choice] = (id ?? '').split(':');
    if (!isHumanStoryId(storyId)) return;
    const atNpc =
      panel === 'town-event' &&
      inTown &&
      townNpc?.id === HUMAN_STORIES[storyId].npcId &&
      townScene?.nearbyNpc?.id === townNpc.id;
    if (atNpc && chooseHumanStory(save, storyId, choice)) {
      persist();
      showTownEvent(townNpc!);
    }
    return;
  }
  if (action.startsWith('town-') && inMortalWorld && !game && !panel) {
    if (action === 'town-enter' && mortalTab === 'town') {
      const previous = save.mortal.scenery;
      save.mortal.population ??= freshTownPopulation(save.age);
      visitTownImmortal(save, previous?.lastVisitAge);
      const scenery = (save.mortal.scenery = townVisit(previous, save.age));
      const memory = townReturnMemory(
        save.mortal.population.seed,
        previous,
        scenery,
        !!save.mortal.hometown,
      );
      if (memory) {
        save.mortal.events.unshift(memory);
        save.mortal.events.splice(6);
      }
      persist();
      void mobileDisplay.enter();
      inTown = true;
      if (save.mortal.hometown) townPosition = { ...HOMETOWN_START };
      lastMortalTick = performance.now();
      renderMortal();
      document.getElementById('town-view')?.focus({ preventScroll: true });
      if (memory) townScene?.showArrival(memory);
    } else if (action === 'town-retry' && inTown) {
      const memory = document.querySelector('.town-return-note')?.textContent;
      renderMortal();
      if (memory) townScene?.showArrival(memory);
    } else if (action === 'town-exit') {
      leaveTown();
      persist();
      renderMortal();
      document.querySelector<HTMLButtonElement>('[data-action="town-enter"]')?.focus();
    } else if (action === 'town-talk') townScene?.talk();
    return;
  }
  if (
    action.startsWith('mortal-') &&
    inMortalWorld &&
    !game &&
    (!panel ||
      panel === 'town-event' ||
      (panel === 'tea-story' && action === 'mortal-activity' && id === 'tea'))
  ) {
    if (
      panel === 'tea-story' &&
      modal.querySelector<HTMLButtonElement>('.tea-story-next')?.disabled !== false
    )
      return;
    if (action === 'mortal-tab' && (id === 'town' || id === 'sects')) {
      leaveTown();
      mortalTab = id;
      document.getElementById('mortal-content')!.innerHTML = mortalTabContent(
        save,
        mortalTab,
        mortalFilter,
        pendingRun?.path,
      );
      ui.querySelectorAll<HTMLButtonElement>('[data-action="mortal-tab"]').forEach((button) => {
        const active = button.dataset.id === mortalTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    } else if (action === 'mortal-filter' && ['all', 'orthodox', 'demonic'].includes(id ?? '')) {
      mortalFilter = id!;
      renderMortal();
    } else {
      const changed =
        action === 'mortal-join'
          ? joinSect(save, id ?? '', pendingRun?.path)
          : action === 'mortal-leave'
            ? leaveSect(save)
            : action === 'mortal-activity'
              ? startActivity(save, id ?? '')
              : action === 'mortal-buy'
                ? tradeIron(save, true)
                : action === 'mortal-sell'
                  ? tradeIron(save, false)
                  : false;
      if (changed) {
        const fromTown = panel === 'town-event' || panel === 'tea-story';
        if (fromTown) {
          closeNpcChat();
          panel = '';
          modal.innerHTML = '';
        }
        if (action === 'mortal-join') {
          selectedTreasure = save.starter;
          treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
        }
        syncMortalChange();
        if (
          fromTown &&
          action === 'mortal-activity' &&
          id === 'tea' &&
          !panel &&
          !save.mortal.activity
        )
          showTeaStory();
        if (fromTown && (action === 'mortal-buy' || action === 'mortal-sell') && townNpc)
          showTownEvent(townNpc);
        if (action === 'mortal-join' || action === 'mortal-leave') toast(save.mortal.events[0]);
        if (action === 'mortal-activity' && !save.mortal.activity) toast(save.mortal.events[0]);
      } else if (panel === 'tea-story') toast('暂时不能继续听书，请先处理寿元或未完成的事项。');
    }
    return;
  }
  if (action === 'export-save' && !game) {
    const url = URL.createObjectURL(
      new Blob([exportSave(save, pendingRun)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `叩仙门：青岚纪存档-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出存档，请保留下载的 JSON 文件');
    return;
  }
  if (action === 'import-save' && !game && panel === 'cultivation') {
    document.querySelector<HTMLInputElement>('#save-import')?.click();
    return;
  }
  if (action === 'confirm-import' && !game && panel === 'import-confirm' && pendingImport) {
    const candidate = pendingImport;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ ...candidate.save, activeRun: candidate.run?.snapshot() ?? null }),
      );
    } catch {
      toast('浏览器无法写入存档，当前进度未更改');
      return;
    }
    Object.assign(save, candidate.save, { sound: save.sound });
    if (!save.journeyEnded && !save.pendingReincarnation) resolveActivity(save);
    pendingRun = candidate.run ? Game.restore(save, candidate.run.snapshot()) : null;
    storageAvailable = true;
    persist();
    pendingImport = null;
    selectedStage = save.unlocked;
    selectedTreasure = save.starter;
    treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
    difficulty = 0;
    schoolFilter = 'all';
    bookTab = 'treasures';
    unlockAudio();
    returnLobby();
    if (save.journeyEnded) return;
    if (save.pendingReincarnation) {
      renderJourneyFarewell(save.pendingReincarnation);
      return;
    }
    if (lifespanInfo(save).remaining === 0) {
      renderLifespanEnd();
      return;
    }
    if (tribulationDue(save)) {
      renderTribulationPending();
      return;
    }
    if (!save.prologueSeen && save.mortal.hometown?.stage !== 'departed') renderPrologue();
    toast('存档已导入，修行进度已恢复');
    return;
  }
  if (panel === 'import-confirm' && ['close', 'cultivation', 'home'].includes(action))
    pendingImport = null;
  if (panel === 'reward-ad' && rewardAd === 'root') {
    if (action === 'ad-root-quality' && SPIRIT_ROOTS.some((r) => r.id === id)) {
      adRoot = id as SpiritRootId;
      adElements = rootElementsFor(adRoot, adElements);
      renderRootPicker();
      refreshAdCountdown('claim-ad-reward', '领取奖励');
      return;
    }
    if (action === 'ad-root-element' && ELEMENTS.some((e) => e.id === id)) {
      const element = id as ElementId;
      const count = spiritRootInfo(adRoot).count;
      if (!count) return;
      if (adElements.includes(element)) adElements = adElements.filter((e) => e !== element);
      else {
        if (adElements.length === count) adElements.pop();
        adElements.push(element);
      }
      renderRootPicker();
      refreshAdCountdown('claim-ad-reward', '领取奖励');
      return;
    }
  }
  if (panel === 'supplies-shortage' && ['close', 'cancel-supplies'].includes(action)) {
    closeRewardAd();
    return;
  }
  if (
    action === 'watch-root-ad' ||
    (action === 'watch-supplies-ad' && panel === 'supplies-shortage')
  ) {
    showRewardAd(action === 'watch-root-ad' ? 'root' : 'supplies');
    return;
  }
  if (panel === 'reward-ad' && (action === 'close' || action === 'cancel-reward-ad')) {
    closeRewardAd();
    return;
  }
  if (action === 'claim-ad-reward') {
    if (game || panel !== 'reward-ad' || !rewardAd || !adReadyAt || Date.now() < adReadyAt) return;
    const kind = rewardAd;
    if (kind === 'root') {
      if (!attuneSpiritRoot(save, adRoot, adElements)) return;
      selectedTreasure = save.starter;
      treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
    } else {
      save.stones += AD_SUPPLIES.stones;
      save.iron += AD_SUPPLIES.iron;
    }
    persist();
    closeRewardAd();
    toast(
      kind === 'root'
        ? `${spiritRootInfo(save.spiritRoot).name}已成 · ${treasure(save.starter).name}为本命 · 下次历练生效`
        : `仙缘补给 · 灵石 +${AD_SUPPLIES.stones} · 玄铁 +${AD_SUPPLIES.iron}`,
    );
    return;
  }
  if (action === 'root-guide') {
    guideTab = 'roots';
    handleAction('guide');
    return;
  }
  if (panel === 'victory' && (action === 'victory-result' || action === 'close')) {
    renderResult();
    return;
  }
  if (action === 'damage' && game && (game.state === 'playing' || game.state === 'paused')) {
    resumeAfterDamage = game.state === 'playing';
    clearInput();
    game.pause();
    previousState = game.state;
    panel = 'damage';
    panelFrame(
      '伤害统计',
      `${game.encounterName} · ${formatTime(game.time)} · 斩妖 ${game.kills}`,
      `${damageReport()}<button class="primary-button guide-close" data-action="close">${resumeAfterDamage ? '继续修行' : '返回暂停界面'} ${smallIcon('arrow')}</button>`,
    );
    persist();
    return;
  }
  if (action === 'watch-ad') {
    showReviveAd();
    return;
  }
  if (action === 'finish-run' && game?.state === 'lost') {
    finishRun();
    return;
  }
  if (action === 'ad-revive') {
    if (panel !== 'revive-ad' || !adReadyAt || Date.now() < adReadyAt || settled || !game?.revive())
      return;
    clearInterval(adTimer);
    adReadyAt = 0;
    clearInput();
    panel = '';
    modal.innerHTML = '';
    previousState = 'playing';
    if (game.state === 'won') {
      finishRun();
      return;
    }
    lastFrame = performance.now();
    updateHud();
    persist();
    return;
  }
  if (action === 'reincarnate' && !game) {
    panel = 'reincarnate';
    panelFrame(
      '轮回转世',
      '重启仙途',
      '<p class="pause-description">将清空此浏览器在当前网址的全部进度：累计年岁、境界修为、灵石玄铁、关卡、根基、法宝收藏与炼器，以及未完成的历练。</p><p class="panel-note">确认后无法撤销。从炼气初期重新开始，保留青霄剑与追魂钉入门收藏，并解锁新灵根对应的入门法宝，重新随机灵根资质与五行，资质可能低于当前。</p><label class="reincarnate-opening"><input id="reincarnate-full-opening" type="checkbox"><span>重走十五岁那一程<small>重走序章、故居告别与离乡；不勾选则直接看新命盘。</small></span></label><div class="pause-actions"><button class="secondary-button" data-action="home">保留此世修行</button><button class="primary-button" data-action="confirm-reincarnate">确认轮回 · 清空进度</button></div>',
    );
    return;
  }
  if (action === 'confirm-reincarnate' && panel === 'reincarnate' && !game) {
    resetLifetime(
      undefined,
      modal.querySelector<HTMLInputElement>('#reincarnate-full-opening')?.checked ? 'full' : false,
    );
    return;
  }
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
    toast(save.autoplay ? '自动历练已开启 · 自动走位与选技' : '已切回手动操作');
    return;
  }
  if (action === 'sound' || action === 'mute') {
    volumeOpen = action === 'sound' && !volumeOpen;
    save.sound = action === 'sound';
    unlockAudio();
    if (save.sound) sound('select');
    persist();
    if (game) renderHud();
    else renderLobby();
    return;
  }
  if (action === 'close') {
    if (panel === 'journey-card') {
      if (journeyCardReturn === 'lifespan-farewell') renderJourneyFarewell('lifespan');
      else if (journeyCardReturn === 'tribulation-farewell') renderJourneyFarewell('tribulation');
      else showPanel('chronicle');
      return;
    }
    closeNpcChat();
    const wasHumanMemory = panel === 'human-memory';
    const returnToAbout = panel === 'about';
    if (game?.state === 'lost' && !settled) return;
    if (game?.state === 'paused' && panel === 'damage') {
      panel = '';
      if (resumeAfterDamage) {
        game.resume();
        modal.innerHTML = '';
      } else renderPause();
      resumeAfterDamage = false;
    } else if (game?.state === 'paused' && panel === 'guide') {
      panel = '';
      renderPause();
    } else if (game?.state === 'paused') {
      game.resume();
      modal.innerHTML = '';
    } else {
      panel = '';
      modal.innerHTML = '';
      if (wasHumanMemory && inMortalWorld && !inTown) renderMortal();
      if (returnToAbout)
        ui.querySelector<HTMLButtonElement>('[data-action="about"]')?.focus({
          preventScroll: true,
        });
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
  if (action === 'about' && !game) {
    showPanel('about');
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
  if (action === 'bestiary-stage') {
    bestiaryStage = Number(id);
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (action === 'medicine' && !game) {
    medicineView = 'bag';
    medicineTier = 'all';
    showPanel('medicine');
    return;
  }
  if (action === 'medicine-shop' && !game && inTown && townNpc?.id === 'herbs') {
    refreshMedicineShop(save.medicine, save.age);
    persist();
    medicineView = 'shop';
    medicineTier = 'all';
    showPanel('medicine');
    return;
  }
  if (action === 'medicine-view' && panel === 'medicine') {
    if (
      id === 'bag' ||
      id === 'craft' ||
      id === 'recipes' ||
      (id === 'shop' && inTown && townNpc?.id === 'herbs')
    ) {
      medicineView = id;
      medicineTier = 'all';
      renderPanel();
    }
    return;
  }
  if (action === 'medicine-tier' && panel === 'medicine') {
    if (id === 'all' || id === '凡品' || id === '灵品' || id === '珍品') {
      medicineTier = id;
      renderPanel();
    }
    return;
  }
  if (action.startsWith('medicine-') && !game && panel === 'medicine' && id && medicineInfo(id)) {
    let message = '';
    if (action === 'medicine-use') {
      const input = modal.querySelector<HTMLInputElement>(`#medicine-quantity-${id}`);
      const result = useMedicine(save, id, !!pendingRun, input ? Number(input.value) : 1);
      message = result.message;
      if (result.ok && id === 'butian') selectedTreasure = save.starter;
    } else if (action === 'medicine-discard' && !pendingRun) {
      delete save.medicine.active[id];
      message = '药效已散去，丹药不返还';
    } else if (action === 'medicine-craft') message = craftMedicine(save, id, !!pendingRun).message;
    else if (
      action === 'medicine-buy' &&
      medicineView === 'shop' &&
      inTown &&
      townNpc?.id === 'herbs'
    )
      message = buyMedicine(save, id)
        ? `${medicineInfo(id)!.name}已收入丹囊`
        : '未能购买，请检查本批货物与灵石';
    else if (action === 'medicine-recipe')
      message = buyMedicineRecipe(save, id) ? '药方已习得，本世保留' : '尚未解锁或灵石不足';
    else return;
    persist();
    if (inMortalWorld) renderMortal();
    else renderLobby();
    if (panel === 'medicine') renderPanel();
    toast(message);
    return;
  }
  if (action === 'guide-tab') {
    guideTab = id!;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
    return;
  }
  if (action === 'journey-card' && (panel === 'chronicle' || panel === 'journey-card')) {
    void renderJourneyCard();
    return;
  }
  if (
    action === 'cultivation' ||
    action === 'arsenal' ||
    action === 'bestiary' ||
    action === 'chronicle'
  ) {
    if (!game) showPanel(action);
    return;
  }
  if (action === 'stage') {
    if (Number(id) <= save.unlocked) {
      selectedStage = Number(id);
      const showStage = () => {
        renderLobby();
        ui.querySelector<HTMLButtonElement>(`.journey-node[data-id="${selectedStage}"]`)?.focus({
          preventScroll: true,
        });
      };
      if (ensureScene(selectedStage, showStage)) showStage();
    }
  }
  if (action === 'path' && !game && !save.mortal.member && isCultivationPath(id)) {
    save.path = id;
    if (alignStarterWithPath(save)) {
      selectedTreasure = save.starter;
      treasurePage = Math.floor(catalogTreasures.findIndex((t) => t.id === save.starter) / 12);
      schoolFilter = 'all';
    }
    persist();
    renderLobby();
  }
  if (action === 'treasure-page') {
    treasurePage = Number(id);
    selectedTreasure = catalogTreasures.filter(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    )[treasurePage * 12].id;
    renderPanel();
  }
  if (action === 'school-filter') {
    schoolFilter = id!;
    treasurePage = 0;
    selectedTreasure = catalogTreasures.find(
      (t) => schoolFilter === 'all' || t.school === schoolFilter,
    )!.id;
    renderPanel();
    modal.querySelector('.panel')?.scrollTo(0, 0);
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
    modal.querySelector('.panel')?.scrollTo(0, 0);
  }
  if (
    action === 'equip' &&
    save.artifacts.includes(selectedTreasure) &&
    allowsSchool(save.path, treasure(selectedTreasure).school)
  ) {
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
  if (action === 'retreat' && !game && panel === 'cultivation') {
    const input = document.querySelector<HTMLInputElement>('#retreat-years');
    if (!input || !input.reportValidity()) return;
    const result = retreat(save, Number(input.value));
    if (!result) return;
    if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
    persist();
    renderLobby();
    if (tribulationDue(save)) {
      renderTribulationPending();
      return;
    }
    const gains = (['vitality', 'power', 'speed'] as const)
      .filter((key) => result.gains[key] > 0)
      .map(
        (key) =>
          `${{ vitality: '气血', power: '法宝伤害', speed: '移速' }[key]} +${result.gains[key]}%`,
      );
    panel = 'retreat-result';
    panelFrame(
      '岁月流转，出关之时',
      '闭关结束',
      `<p class="pause-description">度过 ${Number(result.years.toFixed(1))} 年，未消耗灵石。</p><p class="boss-reward">修为 +${result.cultivation}<small>${result.cultivation ? `相当于闭关前大境界总修为的 ${Number(result.cultivationPercent.toFixed(2))}%` : '本次未积累到 1 点修为'} · ${realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).name}</small><small>${gains.length ? gains.join(' · ') : '此次无额外属性提升'}</small><small>年岁 ${save.age.toFixed(1)} · 收获已保存</small></p><button class="primary-button guide-close" data-action="cultivation">返回洞府</button>`,
    );
    return;
  }
  if (
    action === 'train' &&
    !game &&
    panel === 'cultivation' &&
    train(save, id as 'vitality' | 'power' | 'speed')
  ) {
    if (pendingRun) pendingRun = Game.restore(save, pendingRun.snapshot());
    persist();
    renderLobby();
    renderPanel();
    sound('upgrade');
    if (tribulationDue(save)) renderTribulationPending();
  }
  if (action === 'start' || action === 'retry') startRun();
  if (action === 'restore') restoreRun();
  if (action === 'new-run') {
    pendingRun = null;
    startRun();
  }
  if (action === 'next' && game) {
    selectedStage = Math.min(STAGES.length - 1, game.stage + 1);
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
    if (game.tribulation) {
      renderTribulationForfeit();
      return;
    }
    if (!abandonConfirm) {
      abandonConfirm = true;
      renderPause();
    } else {
      game.state = 'lost';
    }
  }
  if (action === 'choose' && game?.choose(Number(id))) {
    // 经验可跨多级：下帧再次进入 upgrade 时也必须显示新选项。
    previousState = game.state;
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
  if (
    (event.target as Element).matches('.modal-backdrop') &&
    (modal.querySelector('[data-action="close"]') || panel === 'root-reveal')
  ) {
    handleAction('close');
    return;
  }
  if (volumeOpen && !(event.target as Element).closest('.sound-control')) {
    volumeOpen = false;
    document.querySelector('.volume-control')?.remove();
  }
  const target = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!target || target.hasAttribute('disabled')) return;
  event.preventDefault();
  if (
    (target.dataset.costStones || target.dataset.costIron) &&
    showSuppliesShortage(
      Number(target.dataset.costStones || 0),
      Number(target.dataset.costIron || 0),
    )
  )
    return;
  handleAction(target.dataset.action!, target.dataset.id);
});
document.addEventListener('input', (event) => {
  const retreatInput = event.target as HTMLInputElement;
  if (retreatInput.id === 'retreat-years') {
    const years = Number(retreatInput.value);
    document.getElementById('retreat-estimate')!.textContent = retreatEstimate(years);
    document.querySelector<HTMLButtonElement>('[data-action="retreat"]')!.disabled = !retreatPlan(
      save,
      years,
    );
    return;
  }
  const input = event.target as HTMLInputElement;
  if (!input.matches('input[data-volume]')) return;
  save.volume = Number(input.value) / 100;
  input.parentElement!.querySelector('output')!.textContent = `${input.value}%`;
  unlockAudio();
  persist();
});
document.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id !== 'save-import' || game || panel !== 'cultivation') return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_SAVE_FILE_BYTES) throw new Error('存档文件过大，请选择 10 MB 以内的文件');
    const candidate = importSave(await file.text());
    if (game || panel !== 'cultivation') return;
    pendingImport = candidate;
    const imported = candidate.save;
    const realm = realmInfo(imported.cultivation, imported.completed.includes(FINAL_TRIAL_STAGE));
    panel = 'import-confirm';
    panelFrame(
      '导入修行存档',
      '确认后覆盖当前进度',
      `<p class="pause-description">${realm.name} · 累计修为 ${imported.cultivation.toLocaleString('zh-CN', { useGrouping: false })}<br>${spiritRootInfo(imported.spiritRoot).name} · 年岁 ${imported.age.toFixed(1)}<br>${imported.stones} 灵石 · ${imported.iron} 玄铁<br>收藏法宝 ${imported.artifacts.length} 件 · 已通关 ${imported.completed.length} 境<br>丹囊 ${Object.values(imported.medicine.bag).reduce((total, count) => total + count, 0)} 份 · 已购药方 ${imported.medicine.recipes.length} 张 · 生效药效 ${activeMedicines(imported.medicine, imported.age).length} 种<br>人间缘簿 ${Object.keys(imported.mortal.humanStories ?? {}).length} 段 · 旧信与信物已备份<br>仙途履历 ${imported.chronicle.entries.length} 条 · ${imported.mortal.member ? '宗门身份与精研已备份' : '散修'}${imported.mortal.immortal?.claimed ? '<br>人间游历奇遇与领取记录已备份' : ''}${candidate.run ? `<br>未完成历练：${STAGES[candidate.run.stage].name} · ${formatTime(candidate.run.time)} · LV.${candidate.run.level}` : '<br>无未完成历练'}</p><p class="panel-note">导入会替换此网址的全部进度和续局。可先导出当前存档备份，取消不会更改进度。</p><div class="save-actions"><button class="secondary-button" data-action="export-save">备份当前存档</button><button class="secondary-button" data-action="cultivation">取消导入</button><button class="primary-button" data-action="confirm-import">确认覆盖并导入</button></div>`,
    );
  } catch (error) {
    if (!game && panel === 'cultivation')
      toast(error instanceof Error ? error.message : '存档读取失败，当前进度未更改');
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.target as HTMLElement).matches('input[type="range"], input[type="number"]')) return;
  if (
    (event.target as HTMLElement).matches('input, textarea') &&
    !['Escape', 'Tab'].includes(event.key)
  )
    return;
  if (event.key === 'Tab' && modal.innerHTML) {
    const elements = [
      ...modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
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
    if (panel === 'guide' || panel === 'damage') handleAction('close');
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
  if (key === 'e' && !event.repeat && !save.autoplay && game?.state === 'playing') {
    event.preventDefault();
    handleAction('autoplay');
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
  lastMortalTick = performance.now();
  if (inMortalWorld) persist();
  clearInput();
  if (!save.autoplay && game?.state === 'playing') handleAction('pause');
});
window.addEventListener('focus', () => {
  lastMortalTick = performance.now();
});
document.addEventListener('visibilitychange', () => {
  lastMortalTick = performance.now();
  if (document.hidden) {
    clearInput();
    if (!save.autoplay && game?.state === 'playing') handleAction('pause');
    if ((game && !settled) || inMortalWorld) persist();
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
window.addEventListener('resize', () => {
  clearInput();
  renderer.resize();
  canvasDirty = true;
});
window.addEventListener('pagehide', () => {
  if ((game && !settled) || inMortalWorld) persist();
});
window.setInterval(() => {
  if ((game && !settled) || inMortalWorld) persist();
}, 5000);
let lastBackgroundSave = 0;
let canvasDirty = true;
let lastRenderedState: Game['state'] | undefined;
let lastFrame = performance.now(),
  lastHud = 0,
  previousState = '',
  nextAiMove = 0,
  aiChoiceTime = 0;
function simulate(dt: number, now: number) {
  if (game) {
    if (save.autoplay) {
      if (game.state === 'playing' && now >= nextAiMove) {
        game.input = autoplayInput(game);
        nextAiMove = now + 120;
      }
      if (game.state === 'upgrade') {
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
    const realmBefore = realmInfo(
      save.cultivation,
      save.completed.includes(FINAL_TRIAL_STAGE),
    ).step;
    game.update(dt);
    if (!game.tribulation && tribulationDue(save)) {
      if (panel !== 'tribulation-pending' && panel !== 'tribulation-forfeit') {
        renderTribulationPending();
        persist();
      }
      return;
    }
    if (game.expired) {
      if (previousState !== 'lost') {
        previousState = 'lost';
        renderLifespanEnd();
        persist();
      }
      return;
    }
    if (game.state !== previousState) {
      clearInput();
      previousState = game.state;
      if (game.state === 'upgrade') {
        renderChoices();
        persist();
      }
      if (game.state === 'paused') renderPause();
      if (game.state === 'won' && !settled) finishRun();
      if (!game) return;
      if (game.state === 'lost' && !settled) {
        if (abandonConfirm) finishRun();
        else {
          renderDeath();
          persist();
        }
      }
    }
    if (
      !settled &&
      realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).step !== realmBefore
    )
      persist();
    if (now - lastHud > 100) {
      updateHud();
      lastHud = now;
    }
  }
}
function tick(now: number, draw: boolean) {
  let remaining = Math.max(0, Math.min(2, (now - lastFrame) / 1000));
  lastFrame = now;
  if (save.autoplay) {
    while (remaining > 0) {
      const dt = Math.min(1 / 30, remaining);
      simulate(dt, now - remaining * 1000);
      remaining -= dt;
    }
  } else simulate(Math.min(0.05, remaining), now);
  if (
    draw &&
    !inMortalWorld &&
    (canvasDirty || !game || game.state === 'playing' || game.state !== lastRenderedState)
  ) {
    renderer.draw(
      game,
      now,
      game?.stage ?? selectedStage,
      game ? 0 : realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE)).index,
    );
    lastRenderedState = game?.state;
    canvasDirty = false;
  }
}
function frame(now: number) {
  if (save.journeyEnded) {
    requestAnimationFrame(frame);
    return;
  }
  townScene?.update(
    now,
    townClockRunning(inTown, !!townScene?.ready, !document.hidden, document.hasFocus(), panel),
  );
  tickMortal(now);
  tick(now, true);
  requestAnimationFrame(frame);
}
const backgroundClock = new Worker(new URL('./background-clock.ts', import.meta.url), {
  type: 'module',
});
backgroundClock.onmessage = () => {
  if (document.hidden && save.autoplay) {
    const now = performance.now();
    tick(now, false);
    if (game && !settled && now - lastBackgroundSave >= 5000) {
      persist();
      lastBackgroundSave = now;
    }
  }
};
renderLobby();
if (save.pendingReincarnation) renderJourneyFarewell(save.pendingReincarnation);
else if (lifespanInfo(save).remaining === 0) renderLifespanEnd();
else if (tribulationDue(save)) renderTribulationPending();
persist();
ensureScene(selectedStage, () => {
  if (!game && !inMortalWorld) renderLobby();
  if (panel === 'tribulation-pending') renderTribulationPending();
  renderPrologue();
});
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
