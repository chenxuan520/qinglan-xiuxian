import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { COMPACT_HUD_QUERY, compactHud } from '../src/compact-hud.ts';
import { controls, soundControl, runExperience, runWave } from '../src/common-ui.ts';
import { damageNumbersControl } from '../src/damage-numbers.ts';
import {
  DIFFICULTIES,
  STAGE_YEARS_PER_MINUTE,
  MAX_RUN_LEVEL,
  pathInfo,
  xpNeeded,
} from '../src/data.ts';
import { Game } from '../src/game.ts';
import { smallIcon } from '../src/icons.ts';
import { pausePanel } from '../src/lobby-ui.ts';
import { formatNumber } from '../src/number-format.ts';
import { freshSave, IMMORTAL_CULTIVATION, lifespanInfo } from '../src/progress.ts';
import { guideContent } from '../src/guide-content.ts';

function withWindow<T>(value: unknown, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  if (value === undefined) Reflect.deleteProperty(globalThis, 'window');
  else Object.defineProperty(globalThis, 'window', { configurable: true, value });
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function withCompact<T>(matches: boolean, run: () => T): T {
  return withWindow({ matchMedia: () => ({ matches }) }, run);
}

const hash = (html: string) => createHash('sha256').update(html).digest('hex');

function fixture(extreme = false, tribulation = false) {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.lifeMode = extreme ? 'extreme' : 'normal';
  const game = new Game(save, 2, 1, () => 0.5);
  game.time = 91.5;
  game.kills = 12345;
  game.tribulation = tribulation ? 1 : 0;
  game.weapons = [
    { id: 'sword', level: 6, evolved: false, timer: 0 },
    { id: 'pagoda', level: 6, evolved: true, timer: 0 },
  ];
  return { save, game };
}

test('紧凑 HUD 在 Node 或无 matchMedia 的环境关闭', () => {
  for (const value of [undefined, {}, { matchMedia: undefined }]) {
    withWindow(value, () => assert.equal(compactHud(), false));
  }
  assert.equal(
    COMPACT_HUD_QUERY,
    '(pointer: coarse) and (max-width: 650px) and (orientation: portrait)',
  );
});

test('紧凑 HUD 读取当前媒体状态，缓存可适应 matchMedia 工厂及 window 替换', () => {
  const media = { matches: true };
  const queries: string[] = [];
  const owner = {
    matchMedia(query: string) {
      assert.equal(this, owner);
      queries.push(query);
      return media;
    },
  };
  withWindow(owner, () => {
    assert.equal(compactHud(), true);
    media.matches = false;
    assert.equal(compactHud(), false);
    assert.deepEqual(queries, [COMPACT_HUD_QUERY]);
    owner.matchMedia = (query) => {
      queries.push(query);
      return { matches: true };
    };
    assert.equal(compactHud(), true);
    assert.deepEqual(queries, [COMPACT_HUD_QUERY, COMPACT_HUD_QUERY]);
    withWindow({ matchMedia: owner.matchMedia }, () => assert.equal(compactHud(), true));
    assert.equal(queries.length, 3);
  });
});

// 改动前 8262a15 的实际输出摘要，保护用户要求的逐字兼容。
test('既有 smallIcon 输出与基线逐字一致', () => {
  const baseline = {
    sound: '9c3f0fb6c8fc5cb5dd8bf190e19367e0d30b4e2ff21ca23c1c5a67896ab36587',
    mute: 'd3f733e5d513b90613bb2d901c58b713413996df50e1912327039f4d5e315c1c',
    settings: 'c8108af060504397c0254898e11b62134fbac534fa575a8a4c88045649deb5bd',
    pause: '17f20ec7e720b819cf69dfee2759b732b13714966fff5f0398cf93f12437f9cb',
    play: '5f3c5875883626fc3fe67dbec6b0030535d9e418e30c22098969262ed83b699e',
    close: '060875f42d5017ef9620528030a3347f7f7dd541875f2ee2cb8ddda3a7d4cdbc',
    gem: 'ec20add5aaa232edc91c8cc125658cf09f183351e835d41892484561a7efe61a',
    lock: '4e522d13760355d9f1cf984a24f0e73bf32ae32e7b4d50b59b9cc9e1e0635ad5',
    arrow: '2c6063c6fa7b68ab7f136a6947ac8745e821195258079f8be46a81a22929ab7e',
    book: 'b2a1c37547ee0bda7e00f22f4b96b3b8d55b5936dbf28714ebe2dfbbfcbba30d',
    refresh: '1b28a42bb80446ae63ef4323c4891f4c4d879146b44643d092779e2cdf94776b',
    unknown: 'ec20add5aaa232edc91c8cc125658cf09f183351e835d41892484561a7efe61a',
  };
  for (const [id, expected] of Object.entries(baseline))
    assert.equal(hash(smallIcon(id)), expected, id);
});

test('auto 图标仅圆弧箭头分组可旋转，gear 复用六齿路径且新图标为 24px / 线宽 2', () => {
  for (const id of ['auto', 'gear']) {
    assert.match(smallIcon(id), /width="24" height="24" viewBox="0 0 24 24"/);
    assert.match(smallIcon(id), /stroke-width="2"/);
  }
  const auto = smallIcon('auto');
  const arc = auto.match(/<g class="auto-cycle-arc">(.*?)<\/g>/)![1];
  assert.equal((arc.match(/<path /g) ?? []).length, 2);
  assert.match(arc, /a8 8 0 1 1/);
  assert.doesNotMatch(arc, /fill="currentColor"/);
  assert.match(auto, /<\/g><path [^>]+fill="currentColor" stroke="none"\/><\/svg>$/);
  assert.equal(
    smallIcon('gear').replace(/^<svg[^>]+>|<\/svg>$/g, ''),
    smallIcon('settings').replace(/^<svg[^>]+>|<\/svg>$/g, ''),
  );
});

test('提取 soundControl 后 controls 的各类旧输出与基线逐字一致', () => {
  const cases: [boolean, boolean, boolean, boolean, boolean, boolean, string][] = [
    [
      false,
      false,
      false,
      false,
      false,
      false,
      '438af4c901946597d260d78acae3b38432132bf3aee1d2ee65ed13729229f209',
    ],
    [
      true,
      false,
      false,
      false,
      false,
      false,
      '65d09fea22a5140b27977477155446a1ced6de1faada644eec5b47581a7982b7',
    ],
    [
      true,
      true,
      true,
      false,
      true,
      false,
      '1e89e984cecf96048392f87b5472c34ceeb0a55d32c556ca4e1f1c8b1071db44',
    ],
    [
      true,
      true,
      true,
      true,
      true,
      true,
      '7f3bfa25749080a781711f1ffd7a904aba8da25a8f902e5b278ca16dff3d246e',
    ],
    [
      false,
      true,
      true,
      true,
      false,
      false,
      '1cdfe007336b713ca1aa0f455ebbea277ca476e5f06a915a5f80f4adafde363d',
    ],
    [
      true,
      false,
      false,
      true,
      true,
      false,
      '35ac716c96c65ff5470cac8e8622ca21e576bd6d4c71ef2cff0f75b11b257082',
    ],
  ];
  for (const [sound, volumeOpen, autoplay, inGame, available, active, expected] of cases) {
    const save = freshSave();
    Object.assign(save, { sound, autoplay, volume: 0.37 });
    assert.equal(hash(controls(save, volumeOpen, { available, active }, inGame)), expected);
  }
});

test('紧凑声音按钮保留音量、静音入口及声音设置，收起与静音状态不显示滑条', () => {
  const save = freshSave();
  save.volume = 0.37;
  for (const sound of [false, true]) {
    save.sound = sound;
    for (const volumeOpen of [false, true]) {
      const before = JSON.stringify(save);
      const html = soundControl(save, volumeOpen, true);
      assert.match(
        html,
        new RegExp(
          `class="secondary-button" data-action="sound"[^>]*>音效 · ${sound ? '开' : '关'}</button>`,
        ),
      );
      const volume = soundControl(save, volumeOpen).match(
        /<div class="volume-control">.*<\/div>/,
      )?.[0];
      if (sound && volumeOpen) {
        assert.ok(volume && html.includes(volume));
        assert.match(html, /<output>37%<\/output>/);
        assert.match(html, /value="37" data-volume/);
        assert.match(html, /data-action="mute">静音/);
      } else assert.doesNotMatch(html, /data-volume|data-action="mute"/);
      assert.equal(JSON.stringify(save), before);
    }
  }
});

test('非竖屏 pausePanel 及新增 context 的输出与基线逐字一致', () => {
  const cases: [boolean, boolean, boolean, number | undefined, boolean, string][] = [
    [
      false,
      false,
      false,
      undefined,
      true,
      '251a4dfe4c689a00b701ed9013df12dc89bd2a23cffcda34bbe7919d140e1764',
    ],
    [
      false,
      false,
      true,
      60,
      false,
      '40351a1e1ab487d886e6baac120648c16d894d656063acae4ff3b7c9cbdb0d7d',
    ],
    [
      true,
      false,
      false,
      24,
      true,
      '99d8251e8591a066dda730477471215aedec5a41f31ad5608b04318bcff76538',
    ],
    [
      false,
      true,
      false,
      undefined,
      true,
      '108780eef90c277e848a6bb313cf1110a3bd766dd4b1916d56e80f0f48f4ca85',
    ],
  ];
  for (const match of [undefined, false]) {
    withWindow(match === undefined ? undefined : { matchMedia: () => ({ matches: match }) }, () => {
      for (const [extreme, tribulation, abandon, fps, numbers, expected] of cases) {
        const { save, game } = fixture(extreme, tribulation);
        const original = pausePanel(game, save, fps, abandon, numbers);
        assert.equal(hash(JSON.stringify(original)), expected);
        assert.deepEqual(
          pausePanel(game, save, fps, abandon, numbers, {
            display: { available: true, active: true },
            volumeOpen: true,
          }),
          original,
        );
      }
    });
  }
});

test('竖屏暂停替换单行信息，显示路线、难度、FPS、有效寿元和永久修为', () => {
  const { save, game } = fixture();
  save.age = 23.25;
  save.lifespanBonus = 40;
  save.lifespanSpent = 10;
  save.cultivation = 12345;
  const life = lifespanInfo(save);
  const before = JSON.stringify(save);
  const [title, subtitle, html] = withCompact(true, () => pausePanel(game, save, 60, false));
  assert.deepEqual([title, subtitle], ['静心片刻', '修行暂歇']);
  assert.equal((html.match(/class="pause-description/g) ?? []).length, 1);
  assert.ok(html.includes(`${game.encounterName} · ${pathInfo(game.path).name} · `));
  assert.ok(html.includes(`>${DIFFICULTIES[game.difficulty].name}</span> · `));
  assert.match(html, /已斩 12345 妖<small class="pause-frame-rate"[^>]*>60 FPS/);
  assert.ok(
    html.includes(
      `年岁 23.3/${life.limit}岁 · ${STAGE_YEARS_PER_MINUTE[game.stage]}年/分 · 永久修为 ${formatNumber(save.cultivation)}`,
    ),
  );
  assert.notEqual(life.limit, life.base);
  assert.doesNotMatch(html, /compact-pause-medicines|01:31/);
  assert.equal(JSON.stringify(save), before);
});

test('竖屏药效第三行严格沿用 HUD 的名称、剩余年数、分隔与标题，过期药效隐藏', () => {
  const { save, game } = fixture();
  save.age = 25;
  save.medicine.active = { huanglong: 25.6, jinsui: 15025, yangjing: 25, qingling: 24 };
  const html = withCompact(true, () => pausePanel(game, save, undefined, false)[2]);
  assert.match(
    html,
    /<small class="compact-pause-medicines" title="黄龙丹 1年 · 金髓丸 1.5万年"><span>黄龙丹 1年<\/span> <span>金髓丸 1.5万年<\/span><\/small>/,
  );
  assert.doesNotMatch(html, /养精丹|清灵散|FPS/);
});

test('极限天劫的原顶栏难度名称移入暂停后仍为极限修行', () => {
  const { save, game } = fixture(true, true);
  const html = withCompact(true, () => pausePanel(game, save, undefined, false)[2]);
  assert.match(html, />极限修行<\/span>/);
});

test('暂停保留原灵气数值、满级与渡劫分支，桌面暂停不增加信息段', () => {
  const { save, game } = fixture();
  game.xp = 17.9;
  for (const [level, tribulation, expected] of [
    [5, 0, `灵气 17 / ${xpNeeded(5)}`],
    [MAX_RUN_LEVEL, 0, `已满级 · LV. ${MAX_RUN_LEVEL}`],
    [MAX_RUN_LEVEL, 1, '走位渡劫 · 不掉落灵气'],
  ] as const) {
    game.level = level;
    game.tribulation = tribulation;
    assert.equal(runExperience(game), expected);
    const html = withCompact(true, () => pausePanel(game, save, undefined, false)[2]);
    assert.ok(html.includes(`<p class="compact-pause-battle"><span>${expected}</span>`));
    assert.doesNotMatch(
      withCompact(false, () => pausePanel(game, save, undefined, false)[2]),
      /compact-pause-battle/,
    );
  }
});

test('暂停与原顶栏共用四波、妖王、终关和天劫实际状态说明', () => {
  const { save } = fixture();
  const game = new Game(save, 0, 0, () => 0.5);
  for (const [time, expected] of [
    [0, '初入秘境 · 稳固道心'],
    [50, '第二批妖物 · 妖影突袭'],
    [100, '第三批妖物 · 强敌压境'],
    [150, '最后一批 · 妖潮汹涌'],
  ] as const) {
    game.time = time;
    assert.equal(runWave(game), expected);
    assert.ok(
      withCompact(true, () => pausePanel(game, save, undefined, false)[2]).includes(
        `<span>${expected}</span></p>`,
      ),
    );
  }
  game.bossSpawned = true;
  assert.equal(runWave(game), '妖王现身 · 决战之时');
  const trial = new Game(save, 6, 0, () => 0.5);
  trial.trialBossesDefeated = 2;
  assert.equal(runWave(trial), '七劫试炼 · 已破 2 / 7 劫 · 妖潮 1 / 4');
  game.tribulation = 1;
  game.time = 0;
  assert.equal(runWave(game), '劫雷蓄势 · 留意预警');
  game.time = 2;
  assert.equal(runWave(game), '核心显露 · 集中输出');
});

test('修行轮回指南明确手机竖屏永久修为在设置与暂停内', () => {
  const text = guideContent('cultivation');
  assert.match(
    text,
    /电脑与手机横屏在战斗左上角显示境界与突破进度；手机竖屏顶栏显示境界，永久修为可在右上「⚙」的暂停面板查看/,
  );
});

test('竖屏暂停保留无尽寿元、大年岁与渡劫停止计龄的实际显示', () => {
  const { save, game } = fixture(false, true);
  save.cultivation = IMMORTAL_CULTIVATION;
  save.age = 1234567;
  assert.equal(lifespanInfo(save).limit, Infinity);
  const html = withCompact(true, () => pausePanel(game, save, undefined, false)[2]);
  assert.ok(html.includes(`年岁 ${formatNumber(save.age)}/∞岁 · 渡劫暂停计龄`));
  assert.doesNotMatch(html, /Infinity|undefined|NaN/);
});

test('竖屏操作区保留自动、声音、统计、指南、全屏，继续与结束只在底部', () => {
  const { save, game } = fixture();
  save.sound = true;
  save.autoplay = true;
  const html = withCompact(
    true,
    () =>
      pausePanel(game, save, undefined, false, false, {
        display: { available: true, active: true },
        volumeOpen: true,
      })[2],
  );
  const [actions, footer] = html
    .split('<div class="compact-pause-actions">')[1]
    .split('<div class="compact-pause-footer">');
  assert.deepEqual(
    [...actions.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]),
    ['autoplay', 'sound', 'mute', 'damage', 'guide', 'fullscreen'],
  );
  assert.match(actions, /aria-pressed="true"[^>]*>自动历练 · 开/);
  assert.match(actions, /data-volume/);
  assert.match(actions, /data-action="fullscreen"[^>]*>还原/);
  assert.deepEqual(
    [...footer.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]),
    ['resume', 'abandon'],
  );
  assert.ok(html.includes(damageNumbersControl(false)));
  assert.doesNotMatch(html, /class="pause-actions"/);
  const noFullscreen = withCompact(
    true,
    () =>
      pausePanel(game, save, undefined, false, true, {
        display: { available: false, active: false },
        volumeOpen: false,
      })[2],
  );
  assert.doesNotMatch(noFullscreen, /data-action="fullscreen"|data-volume|data-action="mute"/);
  const noContext = withCompact(true, () => pausePanel(game, save, undefined, false)[2]);
  assert.doesNotMatch(noContext, /data-action="fullscreen"|data-volume/);
});

test('竖屏保留完整搭配、叙事、伤害数字开关与各类结束条件', () => {
  for (const [extreme, tribulation, abandon] of [
    [false, false, false],
    [false, false, true],
    [true, false, false],
    [false, true, false],
  ]) {
    const { save, game } = fixture(extreme, tribulation);
    const original = withCompact(false, () => pausePanel(game, save, 24, abandon)[2]);
    const compact = withCompact(true, () => pausePanel(game, save, 24, abandon)[2]);
    for (const pattern of [
      /<div class="pause-build">.*?<\/div>/,
      /<p class="panel-note">.*?<\/p>/,
      /<button class="secondary-button" data-action="abandon"[^>]*>.*?<\/button>/,
    ]) {
      const preserved = original.match(pattern)?.[0];
      assert.ok(preserved && compact.includes(preserved));
    }
    assert.ok(compact.includes(damageNumbersControl(true)));
  }
});
