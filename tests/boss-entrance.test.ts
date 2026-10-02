import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { Game } from '../src/game.ts';
import { freshSave } from '../src/progress.ts';
import { STAGES, TRIAL_BOSS_STAGES, TRIAL_BOSS_TIMES } from '../src/data.ts';
import {
  bossEntranceCue,
  BOSS_ENTRANCE_DURATION,
  BOSS_ENTRANCE_THEMES,
} from '../src/boss-entrance.ts';

function encounter(stage = 0) {
  const save = freshSave();
  save.cultivation = 1e9;
  save.unlocked = 6;
  const g = new Game(save, stage, 0, () => 0.5);
  g.weapons[0].timer = 9999;
  g.player.invincible = 9999;
  g.spawnBudget = -10000;
  g.nextElite = 9999;
  return g;
}

test('六境妖王按原时刻刷新，提前预警并且只生成一次登场效果', () => {
  for (let stage = 0; stage < 6; stage++) {
    const g = encounter(stage);
    const at = STAGES[stage].minutes * 60;
    g.time = at - 0.81;
    assert.equal(bossEntranceCue(g), null);
    g.time = at - 0.4;
    assert.equal(bossEntranceCue(g)!.stage, stage);
    assert.equal(bossEntranceCue(g)!.arriving, false);
    assert.equal(g.boss, undefined);
    const events: string[] = [];
    g.onEvent = (name) => events.push(name);
    g.time = at - 0.01;
    g.update(0.02);
    assert.equal(g.boss!.bossStage, stage);
    assert.equal(g.boss!.cooldown, 2.48, '保留既有首招等待时间');
    assert.deepEqual(events, ['boss']);
    const cue = bossEntranceCue(g)!;
    assert.equal(cue.arriving, true);
    assert.equal(cue.stage, stage);
    assert.equal(g.effects.filter((e) => e.kind === 'boss-entrance').length, 1);
    assert.equal(g.effects[0].maxLife, BOSS_ENTRANCE_DURATION);
    g.update(0.02);
    assert.deepEqual(events, ['boss']);
    assert.equal(g.effects.filter((e) => e.kind === 'boss-entrance').length, 1);
  }
});

test('出场效果消散后旧降临提示不回显，其他战斗提示仍正常显示', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const block = source.match(
    /  const notice = document.getElementById\('notice'\)[^]*?(?=  const aliveBosses)/,
  )![0];
  for (let stage = 0; stage < 7; stage++) {
    const g = encounter(stage);
    const waves = stage === 6 ? TRIAL_BOSS_TIMES : [STAGES[stage].minutes * 60];
    let visible = false;
    const notice = {
      textContent: '',
      classList: { toggle: (_name: string, value: boolean) => (visible = value) },
    };
    const drawNotice = () =>
      runInNewContext(stripTypeScriptTypes(block), {
        game: g,
        bossEntranceCue,
        document: { getElementById: () => notice },
      });
    for (const at of waves) {
      // 隔离本次登场提示，避免上一位仍在场妖王的技能提示覆盖它。
      g.enemies = [];
      g.effects = [];
      g.time = at - 0.01;
      g.update(0.02);
      assert.ok(g.notice.includes('降临'));
      for (const elapsed of [0.02, 1, 1.85, 2.4]) {
        while (g.time < at + elapsed) g.update(0.01);
        drawNotice();
        assert.equal(visible, false, `第 ${stage + 1} 境：${elapsed} 秒不回显旧提示`);
        assert.equal(notice.textContent, '', '抑制名号时立即清空文字，避免淡出过渡叠字');
        if (elapsed > BOSS_ENTRANCE_DURATION) {
          assert.equal(bossEntranceCue(g), null);
          assert.ok(g.noticeTime > 0, '旧提示仍未到期，隐藏不依赖出场 cue');
        }
      }
      g.announce('精英现身 · 击败可得炼器宝匣');
      drawNotice();
      assert.equal(visible, true);
      assert.equal(notice.textContent, g.notice);
      g.noticeTime = 0;
      drawNotice();
      assert.equal(visible, false);
      assert.equal(notice.textContent, '');
    }
  }
});

test('出场法阵逐帧扩散和重复登场不累积离屏画布缓存', async () => {
  const url = new URL('../src/render.ts', import.meta.url);
  const hook = registerHooks({
    load(id, context, nextLoad) {
      if (id !== url.href) return nextLoad(id, context);
      return {
        format: 'module',
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(url, 'utf8'), { mode: 'transform' }),
      };
    },
  });
  const { Renderer } = await import('../src/render.ts').finally(() => hook.deregister());
  const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => {} });
  let canvases = 0;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        canvases++;
        return { getContext: () => ctx };
      },
    },
  });
  try {
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      ctx,
      width: 390,
      height: 844,
      scale: 1,
      formations: new Map(),
      reducedMotion: { matches: false },
      sprite() {},
    });
    for (const still of [false, true]) {
      renderer.reducedMotion.matches = still;
      for (let repeat = 0; repeat < 2; repeat++)
        for (let stage = 0; stage < 7; stage++) {
          const g = encounter(stage);
          g.weapons = [];
          const effect = {
            x: 0,
            y: 0,
            life: 1.8,
            maxLife: 1.8,
            radius: stage === 6 ? 62 : 48,
            color: STAGES[stage].color,
            kind: 'boss-entrance',
            bossStage: stage,
          };
          g.effects = [effect];
          for (let frame = 0; frame < 120; frame++) {
            effect.life = 1.8 * (1 - frame / 120);
            renderer.drawGame(g, frame / 60);
          }
        }
    }
    assert.equal(canvases, 0, '动态法阵不能为每一帧分配画布');
    assert.equal(renderer.formations.size, 0, '登场次数不能扩大纹理缓存');
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('终关每次复临和仙尊均使用对应名号，已在场妖王不阻止下一位登场', () => {
  const g = encounter(6);
  for (let wave = 0; wave < 7; wave++) {
    const at = TRIAL_BOSS_TIMES[wave];
    g.time = at - 0.4;
    g.effects = [];
    const warning = bossEntranceCue(g)!;
    assert.equal(warning.stage, TRIAL_BOSS_STAGES[wave]);
    assert.equal(warning.arriving, false);
    g.time = at - 0.01;
    g.update(0.02);
    assert.equal(bossEntranceCue(g)!.stage, TRIAL_BOSS_STAGES[wave]);
    assert.equal(bossEntranceCue(g)!.arriving, true);
    assert.equal(g.enemies.filter((e) => e.boss).length, wave + 1);
    assert.equal(g.trialBossesSpawned, wave + 1);
  }
  g.effects = [];
  assert.equal(bossEntranceCue(g), null, '七位到齐后不再出现下一波预警');
});

test('暂停冻结出场、结束后消散，刷新续局不重播或更改存档结构', () => {
  const g = encounter();
  g.time = 179.99;
  g.update(0.02);
  const cue = bossEntranceCue(g);
  g.pause();
  const snapshot = g.snapshot();
  for (let i = 0; i < 60; i++) g.update(0.05);
  assert.deepEqual(bossEntranceCue(g), cue);
  assert.deepEqual(g.snapshot(), snapshot);
  const restored = Game.restore(g.save, JSON.parse(JSON.stringify(snapshot)))!;
  assert.ok(restored);
  assert.ok(restored.boss);
  assert.equal(bossEntranceCue(restored), null);
  assert.equal(restored.boss!.cooldown, g.boss!.cooldown);
  g.resume();
  for (let i = 0; i < 37; i++) g.update(0.05);
  assert.equal(bossEntranceCue(g), null);
  assert.ok(g.boss!.cooldown > 0, '登场已完成，妖王尚未释放首招');
});

test('出场查询不消耗战斗随机数，结束和独立天劫不显示秘境名号', () => {
  const g = encounter();
  g.time = 179.6;
  const before = g.snapshot();
  g.random = () => {
    throw new Error('视觉不可消耗战斗随机数');
  };
  for (let i = 0; i < 30; i++) assert.ok(bossEntranceCue(g));
  assert.deepEqual(g.snapshot(), before);
  for (const state of ['won', 'lost'] as const) {
    g.state = state;
    assert.equal(bossEntranceCue(g), null);
  }
  g.state = 'playing';
  g.tribulation = 1;
  assert.equal(bossEntranceCue(g), null);
});

test('七种登场在桌面、手机和横屏可绘制，减少动态效果停用粒子与藤蔓运动', async () => {
  const url = new URL('../src/render.ts', import.meta.url);
  const hook = registerHooks({
    load(id, context, nextLoad) {
      if (id !== url.href) return nextLoad(id, context);
      return {
        format: 'module',
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(url, 'utf8'), { mode: 'transform' }),
      };
    },
  });
  const { Renderer } = await import('../src/render.ts').finally(() => hook.deregister());
  assert.equal(new Set(BOSS_ENTRANCE_THEMES.map((t) => t.particle)).size, 7);
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [844, 390],
    [320, 568],
  ])
    for (let stage = 0; stage < 7; stage++)
      for (const still of [false, true]) {
        const texts: { value: string; y: number }[] = [];
        let leaves = 0,
          offset = 0;
        const offsets: number[] = [];
        const ctx = new Proxy({} as CanvasRenderingContext2D, {
          get:
            (_, key) =>
            (...args: any[]) => {
              if (key === 'createLinearGradient' || key === 'createRadialGradient')
                return { addColorStop() {} };
              if (key === 'save') offsets.push(offset);
              if (key === 'restore') offset = offsets.pop()!;
              if (key === 'translate') offset += args[1];
              if (key === 'fillText') texts.push({ value: args[0], y: args[2] + offset });
              if (key === 'ellipse') leaves++;
            },
        });
        const renderer = Object.assign(Object.create(Renderer.prototype), {
          ctx,
          width,
          height,
          reducedMotion: { matches: still },
          sprite() {},
        });
        const g = encounter(stage);
        g.effects.push({
          x: 0,
          y: 0,
          life: 1.2,
          maxLife: 1.8,
          radius: 48,
          color: '#fff',
          kind: 'boss-entrance',
          bossStage: stage,
        });
        const before = g.snapshot();
        renderer.drawBossEntrance(g);
        assert.ok(texts.some((t) => t.value === STAGES[stage].boss));
        assert.ok(texts.slice(-3).every((t) => t.y > 0 && t.y < height - 65));
        if (still) assert.equal(leaves, 0);
        assert.deepEqual(g.snapshot(), before);
      }
});
