import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOPLAY_BUILDS,
  changeAutoplayBuild,
  defaultAutoplayBuild,
  validAutoplayBuild,
  type AutoplayBuildMode,
} from '../src/autoplay-build.ts';
import { autoplayChoice, autoplayInput } from '../src/autoplay.ts';
import { freshSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { Game } from '../src/game.ts';
import { MAX_PASSIVES, MAX_WEAPONS } from '../src/data.ts';
import { seeded } from '../scripts/balance-policy.ts';

function game(mode: AutoplayBuildMode = 'default', path: 'orthodox' | 'demonic' | 'dual' = 'dual') {
  const save = freshSave('heaven', ['wood'], path, () => 0.5);
  save.autoplayBuild.mode = mode;
  if (path !== 'demonic') {
    save.starter = 'orbit';
    save.artifacts.push('orbit');
  }
  return new Game(save, 0, 0, seeded(82));
}
test('新设置默认沿用原策略，旧档升级保留进度，非法本地设置安全回退', () => {
  assert.deepEqual(freshSave().autoplayBuild, defaultAutoplayBuild());
  const save = freshSave();
  save.cultivation = 1234;
  const old = { ...save, schema: SAVE_SCHEMA - 1, autoplayBuild: undefined };
  const loaded = readSave(JSON.stringify(old));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.save.cultivation, 1234);
  assert.deepEqual(loaded.save.autoplayBuild, defaultAutoplayBuild());
  for (const bad of [
    null,
    'native',
    {},
    { mode: 'invalid', targets: ['', ''] },
    { mode: 'custom', targets: ['sword', 'sword'] },
    { mode: 'custom', targets: ['missing', ''] },
    { mode: 'default', targets: ['', '', ''] },
  ]) {
    assert.equal(validAutoplayBuild(bad), false);
    assert.deepEqual(
      readSave(JSON.stringify({ ...save, autoplayBuild: bad })).save.autoplayBuild,
      defaultAutoplayBuild(),
    );
    assert.throws(() => importSave(JSON.stringify({ ...save, autoplayBuild: bad })), /损坏/);
  }
});
test('两件目标不可重复，切换倾向保留选择，修改不会影响原对象', () => {
  const original = { mode: 'custom' as const, targets: ['sword', 'fire'] as [string, string] };
  const moved = changeAutoplayBuild(original, '1', 'sword')!;
  assert.deepEqual(moved.targets, ['', 'sword']);
  assert.deepEqual(original.targets, ['sword', 'fire']);
  const next = changeAutoplayBuild(original, 'mode', 'native')!;
  assert.deepEqual(next.targets, original.targets);
  assert.equal(changeAutoplayBuild(original, '2', 'fire'), null);
  assert.equal(changeAutoplayBuild(original, '0', 'not-a-weapon'), null);
  assert.equal(changeAutoplayBuild(original, 'mode', 'not-a-mode'), null);
});
test('本命优先围绕本局实际入场法宝，提升升重与觉醒功法优先级', () => {
  const g = game('native');
  g.save.starter = 'sword'; // 改了首页本命不应把未结束的青莲灯当成新剑局。
  assert.equal(g.weapons[0].id, 'orbit');
  g.choices = [
    { type: 'weapon', id: 'sword', level: 2 },
    { type: 'weapon', id: 'orbit', level: 2 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.weapons[0].level = 4;
  const recipe = g.evolutionRequirements('orbit')[0];
  g.choices = [
    { type: 'weapon', id: 'sword', level: 3 },
    { type: 'passive', id: recipe, level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.weapons[0].level = 6;
  g.choices.push({ type: 'evolve', id: 'sword', level: 7 });
  assert.equal(autoplayChoice(g)!.index, 2, '现成觉醒仍优先');
});
test('指定两件法宝均可优先获取，目标缺失或路线不符时与默认一致', () => {
  const g = game('custom', 'orthodox');
  g.save.autoplayBuild.targets = ['arrow', 'ice'];
  for (const id of g.save.autoplayBuild.targets) {
    g.choices = [
      { type: 'weapon', id: 'sword', level: 3 },
      { type: 'weapon', id, level: 1 },
    ];
    assert.equal(autoplayChoice(g)!.index, 1);
  }
  for (const targets of [
    ['', ''],
    ['skull', ''],
  ] as [string, string][]) {
    g.save.autoplayBuild.targets = targets;
    g.player.hp = g.player.maxHp * 0.2;
    g.choices = [
      { type: 'evolve', id: 'sword', level: 7 },
      { type: 'heal', id: 'heal', level: 1 },
    ];
    const actual = autoplayChoice(g);
    g.save.autoplayBuild.mode = 'default';
    assert.deepEqual(actual, autoplayChoice(g));
    g.save.autoplayBuild.mode = 'custom';
  }
});
test('兼修优先补已有配方，避免为同一法宝挤占两个功法槽', () => {
  const g = game('custom');
  g.save.autoplayBuild.targets = ['sword', ''];
  g.weapons = [{ id: 'sword', level: 4, evolved: false, timer: 0 }];
  g.passives = { blood: 2 };
  g.choices = [
    { type: 'passive', id: 'power', level: 1 },
    { type: 'passive', id: 'blood', level: 3 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
});
test('预留末格只在缺配方时生效，法宝后半程可补齐而不无限等待', () => {
  const g = game('custom');
  g.save.autoplayBuild.targets = ['orbit', ''];
  g.weapons[0].level = 4;
  const recipe = g.evolutionRequirements('orbit')[0];
  g.passives = { power: 1, haste: 1, guard: 1 };
  assert.ok(!g.passives[recipe]);
  g.choices = [
    { type: 'passive', id: 'crit', level: 1 },
    { type: 'weapon', id: 'poison', level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.passives = { power: 1, haste: 1, [recipe]: 1 };
  g.choices = [
    { type: 'passive', id: 'crit', level: 1 },
    { type: 'passive', id: 'magnet', level: 1 },
  ];
  const actual = autoplayChoice(g);
  g.save.autoplayBuild.mode = 'default';
  assert.deepEqual(actual, autoplayChoice(g), '已学配方不再空留末格');
  g.save.autoplayBuild = { mode: 'custom', targets: ['poison', ''] };
  g.weapons = ['sword', 'orbit', 'fire', 'lightning', 'ice'].map((id) => ({
    id,
    level: 1,
    evolved: false,
    timer: 0,
  })) as Game['weapons'];
  g.passives = {};
  g.choices = [
    { type: 'weapon', id: 'pulse', level: 1 },
    { type: 'passive', id: 'magnet', level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.time = 125;
  assert.equal(autoplayChoice(g)!.index, 0);
});
test('保命稳进确实优先护体，目标培养遇危急时优先实际恢复', () => {
  const g = game('survival');
  g.choices = [
    { type: 'weapon', id: 'sword', level: 2 },
    { type: 'passive', id: 'guard', level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  for (const mode of ['native', 'survival', 'offense', 'custom'] as const) {
    g.save.autoplayBuild = { mode, targets: ['sword', ''] };
    g.player.hp = g.player.maxHp * 0.2;
    g.choices = [
      { type: 'evolve', id: 'sword', level: 7 },
      { type: 'heal', id: 'heal', level: 1 },
    ];
    assert.deepEqual(autoplayChoice(g), { index: 1, reroll: false });
    g.player.hp = g.player.maxHp;
    assert.equal(autoplayChoice(g)!.index, 0);
  }
});
test('极致进攻优先输出与攻速，普通残血保持进攻，危急时仍能自救', () => {
  const g = game('offense');
  g.choices = [
    { type: 'passive', id: 'guard', level: 1 },
    { type: 'passive', id: 'power', level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.choices = [
    { type: 'passive', id: 'duration', level: 1 },
    { type: 'passive', id: 'haste', level: 1 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.player.hp = g.player.maxHp * 0.45;
  g.choices = [
    { type: 'heal', id: 'heal', level: 1 },
    { type: 'weapon', id: 'sword', level: 2 },
  ];
  assert.equal(autoplayChoice(g)!.index, 1);
  g.player.hp = g.player.maxHp * 0.2;
  assert.equal(autoplayChoice(g)!.index, 0);
});
test('设置仅影响排序，候选概率、随机数、战斗属性和走位均不改变', () => {
  const snapshots: string[] = [];
  for (const { id: mode } of AUTOPLAY_BUILDS) {
    const g = game(mode);
    g.save.autoplayBuild.targets = ['poison', 'ice'];
    g.state = 'upgrade';
    g.choices = g.makeChoices();
    let randomCalls = 0;
    g.random = () => {
      randomCalls++;
      return 0.5;
    };
    const before = JSON.stringify(g.snapshot()),
      stats = { ...g.stats };
    autoplayChoice(g);
    assert.equal(randomCalls, 0);
    assert.equal(JSON.stringify(g.snapshot()), before);
    assert.deepEqual(g.stats, stats);
    snapshots.push(
      JSON.stringify({ snapshot: g.snapshot(), stats: g.stats, input: autoplayInput(g) }),
    );
  }
  assert.equal(new Set(snapshots).size, 1);
});
test('各倾向的真实候选可连续执行，重悟有限，法宝与功法槽不溢出', () => {
  for (const { id: mode } of AUTOPLAY_BUILDS)
    for (const path of ['orthodox', 'demonic', 'dual'] as const) {
      const g = game(mode, path);
      g.save.autoplayBuild.targets = ['ice', 'skull'];
      for (let level = 0; level < 75; level++) {
        g.state = 'upgrade';
        g.choices = g.makeChoices();
        let attempts = 0;
        while (g.state === 'upgrade') {
          assert.ok(++attempts <= 4);
          const picked = autoplayChoice(g)!;
          assert.ok(picked);
          assert.ok(picked.reroll ? g.reroll() : g.choose(picked.index));
        }
        assert.ok(g.weapons.length <= MAX_WEAPONS);
        assert.ok(Object.keys(g.passives).length <= MAX_PASSIVES);
        assert.ok(g.rerolls >= 0 && g.rerolls <= 3);
      }
    }
});
test('各倾向和目标随存档完整往返，续局仍使用已保存的倾向', () => {
  for (const { id: mode } of AUTOPLAY_BUILDS) {
    const g = game(mode);
    g.save.autoplayBuild.targets = ['poison', 'ice'];
    g.state = 'upgrade';
    g.choices = g.makeChoices();
    const restored = importSave(exportSave(g.save, g));
    assert.deepEqual(restored.save.autoplayBuild, g.save.autoplayBuild);
    assert.deepEqual(autoplayChoice(restored.run!), autoplayChoice(g));
    assert.notEqual(restored.save.autoplayBuild.targets, g.save.autoplayBuild.targets);
  }
});
