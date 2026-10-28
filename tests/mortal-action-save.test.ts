import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchAction } from '../src/action-controller.ts';
import { executeMortalAction } from '../src/town-host.ts';
import { joinSect, resolveActivity, studyPlan } from '../src/mortal.ts';
import { TOWN_JOBS } from '../src/mortal-data.ts';
import { freshSave, readSave, realmCost, tribulationDue, lifespanInfo } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { chooseHumanStory, syncHumanStories } from '../src/human-stories.ts';
import { freshTownPopulation } from '../src/town-population.ts';

function harness(panel = 'town-event') {
  const save = readSave(JSON.stringify(freshSave('heaven', ['metal'], 'orthodox', () => 0.5))).save;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.stones = 10000;
  save.cultivation = realmCost(0) + realmCost(1);
  assert.equal(
    joinSect(save, 'haste', undefined, () => 0),
    true,
  );
  save.mortal.member!.dueAt = save.mortal.years + 0.25;
  let fail = true;
  let stored = JSON.stringify(save);
  const effects: string[] = [];
  const toasts: string[] = [];
  const shell: any = {
    save,
    game: null,
    pendingRun: null,
    inMortalWorld: true,
    panel,
    saveLock: null,
    structuredClone,
    Game,
    executeMortalAction,
    resolveActivity,
    syncHumanStories,
    tribulationDue,
    lifespanInfo,
    modal: { innerHTML: 'original dialog', querySelector: () => ({ disabled: false }) },
    medicinePanel: { handle: () => false },
    closeNpcChat: () => effects.push('close-chat'),
    renderMortal: () => effects.push('render'),
    showTeaStory: () => effects.push('tea'),
    toast: (text: string) => toasts.push(text),
    writeSave(next: unknown) {
      if (shell.saveLock) throw Error('save locked');
      if (fail) throw new DOMException('quota fixture', 'QuotaExceededError');
      stored = JSON.stringify(next);
      effects.push('write');
    },
    syncMortalChange() {
      // 原路径的 persist 吞掉写入失败后继续重绘。
      resolveActivity(save);
      try {
        shell.writeSave(save);
      } catch {}
      shell.renderMortal();
    },
  };
  return { shell, effects, toasts, stored: () => stored, allow: () => (fail = false) };
}

for (const kind of [...Object.keys(TOWN_JOBS), 'study', 'leave']) {
  test(`人间${kind}保存失败不结算、不关弹窗；恢复后仅一次入账且能读回`, () => {
    const { shell, effects, toasts, stored, allow } = harness();
    const before = structuredClone(shell.save);
    const raw = stored();
    const action = kind === 'leave' ? 'mortal-leave' : 'mortal-activity';
    for (let i = 0; i < 2; i++) {
      dispatchAction(shell, action, kind);
      assert.deepEqual(shell.save, before);
      assert.equal(stored(), raw);
      assert.equal(shell.panel, 'town-event');
      assert.equal(shell.modal.innerHTML, 'original dialog');
      assert.deepEqual(effects, []);
      assert.match(toasts.at(-1)!, /尚未保存/);
    }
    allow();
    dispatchAction(shell, action, kind);
    assert.equal(effects[0], 'write');
    assert.equal(effects.filter((e) => e === 'write').length, 1);
    assert.equal(shell.panel, '');
    assert.equal(shell.modal.innerHTML, '');
    assert.deepEqual(JSON.parse(stored()), shell.save);
    assert.deepEqual(readSave(stored()).save, shell.save);
    const years =
      kind === 'leave'
        ? 0
        : kind === 'study'
          ? studyPlan(before).years
          : TOWN_JOBS[kind as keyof typeof TOWN_JOBS].years;
    assert.ok(Math.abs(shell.save.age - before.age - years) < 1e-8);
    assert.equal(shell.save.mortal.activity, null);
    if (kind === 'leave') assert.equal(shell.save.mortal.member, null);
    else {
      assert.ok(shell.save.mortal.member.dueAt > before.mortal.member!.dueAt);
      const cost = kind === 'study' ? studyPlan(before).stones : 0;
      const reward = kind === 'herbs' || kind === 'escort' ? TOWN_JOBS[kind].stones : null;
      if (reward !== null)
        assert.equal(shell.save.stones, before.stones - before.mortal.member!.dues + reward);
      if (kind === 'study') {
        assert.equal(shell.save.stones, before.stones - before.mortal.member!.dues - cost);
        assert.equal(shell.save.mortal.mastery.haste, 1);
      }
    }
    assert.equal(effects.includes('tea'), kind === 'tea');
  });
}

test('委托保存失败保留未完历练与茶馆入口，成功后才恢复对局并打开新故事', () => {
  const { shell, effects, stored, allow } = harness('tea-story');
  shell.pendingRun = new Game(shell.save, 0, 0, () => 0.5);
  const previousRun = shell.pendingRun;
  const snapshot = previousRun.snapshot();
  const before = structuredClone(shell.save);
  dispatchAction(shell, 'mortal-activity', 'tea');
  assert.deepEqual(shell.save, before);
  assert.equal(shell.pendingRun, previousRun);
  assert.deepEqual(shell.pendingRun.snapshot(), snapshot);
  assert.equal(shell.panel, 'tea-story');
  assert.deepEqual(effects, []);
  allow();
  dispatchAction(shell, 'mortal-activity', 'tea');
  assert.notEqual(shell.pendingRun, previousRun);
  assert.ok(shell.pendingRun);
  assert.equal(effects.at(-1), 'tea');
  assert.equal(JSON.parse(stored()).age, before.age + 0.5);
});

test('委托条件不满足及存档锁定不写入、不关闭当前入口', () => {
  const { shell, effects, stored, allow } = harness();
  allow();
  const before = stored();
  dispatchAction(shell, 'mortal-activity', 'unknown');
  assert.deepEqual(effects, []);
  assert.equal(stored(), before);
  shell.saveLock = 'stale';
  shell.renderSaveLocked = () => {};
  dispatchAction(shell, 'mortal-activity', 'herbs');
  assert.deepEqual(effects, []);
  assert.equal(stored(), before);
});

test('委托跨故人离世时，旧信、年表与奖励在同一次成功写入中结算', () => {
  const { shell, effects, stored, allow } = harness();
  shell.save.mortal.population = freshTownPopulation(shell.save.age, () => 0.5);
  assert.equal(chooseHumanStory(shell.save, 'friend', 'meet'), true);
  const story = shell.save.mortal.humanStories!.friend!;
  shell.save.age = story.endsAt - 0.5;
  const before = structuredClone(shell.save);
  dispatchAction(shell, 'mortal-activity', 'herbs');
  assert.deepEqual(shell.save, before);
  assert.deepEqual(effects, []);
  allow();
  dispatchAction(shell, 'mortal-activity', 'herbs');
  assert.equal(effects.filter((e) => e === 'write').length, 1);
  assert.equal(shell.save.mortal.humanStories!.friend!.ended, true);
  assert.match(shell.save.mortal.events[0], /辞世/);
  assert.deepEqual(JSON.parse(stored()), shell.save);
  assert.equal(syncHumanStories(shell.save), false);
  assert.deepEqual(readSave(stored()).save, shell.save);
});
