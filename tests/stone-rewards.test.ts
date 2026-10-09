import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { adSupplies, FINAL_TRIAL_STAGE, MAX_REVIVES, STAGES } from '../src/data.ts';
import {
  freshSave,
  parseSave,
  lifespanInfo,
  realmInfo,
  settleRun,
  tribulationDue,
} from '../src/progress.ts';

test('广告灵石按最高解锁秘境递增，重游前关与刷新不降低补给，玄铁保持30', () => {
  const expected = [300, 450, 600, 850, 1200, 1600, 2200];
  for (let stage = 0; stage < STAGES.length; stage++) {
    const save = freshSave();
    save.unlocked = stage;
    const restored = parseSave(JSON.stringify(save));
    assert.deepEqual(adSupplies(restored.unlocked), { stones: expected[stage], iron: 30 });
    assert.equal(adSupplies(save.unlocked).stones, expected[stage]);
  }
  assert.equal(adSupplies(-1).stones, 300);
  assert.equal(adSupplies(100).stones, 2200);
  assert.equal(adSupplies(NaN).stones, 300);
  assert.equal(adSupplies(Infinity).stones, 300);
});

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const action = source.match(/^function handleAction\([^]*?^\}/m);
assert.ok(action);
const flow = new Script(stripTypeScriptTypes(action[0]));

test('实际领取入口须广告结束，分档提示与到账一致，重复点击不再次发奖', () => {
  for (const unlocked of [0, 3, 6]) {
    const save = freshSave();
    save.unlocked = unlocked;
    save.prologueSeen = true;
    save.hometownSeen = true;
    if (save.mortal.hometown) save.mortal.hometown.stage = 'departed';
    const context = createContext({
      save,
      saveLock: null,
      panel: 'reward-ad',
      rewardAd: 'supplies',
      game: null,
      pendingRun: null,
      inMortalWorld: false,
      FINAL_TRIAL_STAGE,
      MAX_REVIVES,
      tribulationDue,
      lifespanInfo,
      realmInfo,
      adSupplies,
      completed: false,
      writes: 0,
      messages: [] as string[],
      adCompleted: () => context.completed,
      persist: () => context.writes++,
      closeRewardAd: () => {
        context.panel = '';
        context.rewardAd = '';
      },
      toast: (message: string) => context.messages.push(message),
    });
    flow.runInContext(context);
    context.handleAction('claim-ad-reward');
    assert.equal(save.stones, 0);
    assert.equal(save.iron, 0);
    context.completed = true;
    context.handleAction('claim-ad-reward');
    assert.equal(save.stones, adSupplies(unlocked).stones);
    assert.equal(save.iron, 30);
    assert.match(context.messages[0], new RegExp(`灵石 \\+${save.stones}`));
    assert.equal(context.writes, 1);
    context.handleAction('claim-ad-reward');
    assert.equal(save.stones, adSupplies(unlocked).stones);
    assert.equal(context.writes, 1);
  }
});

test('各关斩妖与战斗时间灵石小幅递增，胜败及难度保留，首关保持原值', () => {
  const expectedKills = [0.35, 0.38, 0.41, 0.44, 0.47, 0.5, 0.53];
  const expectedSeconds = [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16];
  for (let stage = 0; stage < STAGES.length; stage++)
    for (const victory of [false, true])
      for (const [difficulty, multiplier] of [1, 1.5, 2.2].entries()) {
        const save = freshSave();
        const result = settleRun(save, {
          stage,
          difficulty,
          kills: 100,
          time: 100,
          victory,
          iron: 0,
          level: 1,
        });
        const expected = Math.floor(
          (100 * expectedKills[stage] +
            100 * expectedSeconds[stage] +
            (victory ? STAGES[stage].reward : 0)) *
            multiplier,
        );
        assert.equal(result.stones, expected);
        assert.equal(save.stones, expected);
      }
});
