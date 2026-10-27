import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { Game } from '../src/game.ts';
import {
  freshSave,
  attuneSpiritRoot,
  lifespanInfo,
  extendLifespan,
  tribulationDue,
} from '../src/progress.ts';
import { adSupplies, TREASURES, spiritRootInfo } from '../src/data.ts';
const source = readFileSync(new URL('../src/action-controller.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile(
  'controller.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const flow = new Script(
  stripTypeScriptTypes(
    [
      'savePreparation',
      'saveAdRun',
      'reportAdClaim',
      'handleRewardAd',
      'handleRunOutcome',
      'handleLifeLimit',
    ]
      .map((name) => {
        const node = ast.statements.find(
          (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
        );
        assert.ok(node, name);
        return node.getText(ast);
      })
      .join('\n'),
    { mode: 'transform' },
  ),
);
function harness(kind: string, location = 'idle') {
  const save = freshSave(
    'five',
    ['metal', 'wood', 'water', 'fire', 'earth'],
    'orthodox',
    () => 0.5,
  );
  save.age = kind === 'lifespan' ? 100 : 20;
  let run: Game | null = null;
  if (location !== 'idle') {
    run = new Game(save, 0, 0, () => 0.5);
    run.time = 15;
    run.state = 'lost';
    run.player.hp = 0;
  }
  const c: any = {
    save,
    Game,
    structuredClone,
    attuneSpiritRoot,
    adSupplies,
    spiritRootInfo,
    extendLifespan,
    lifespanInfo,
    tribulationDue,
    game: location === 'active' ? run : null,
    pendingRun: location === 'pending' ? run : null,
    panel: kind === 'revive' ? 'revive-ad' : kind === 'lifespan' ? 'lifespan-ad' : 'reward-ad',
    rewardAd: kind,
    adRoot: 'heaven',
    adElements: ['metal'],
    catalogTreasures: TREASURES,
    treasure: (id: string) => TREASURES.find((t) => t.id === id),
    blocked: true,
    watched: false,
    storageAvailable: true,
    saveLock: null,
    settled: false,
    modal: { innerHTML: 'ad' },
    messages: [],
    writes: 0,
    reports: 0,
    adClaimReport: () => c.reports++,
    adCompleted: () => c.watched,
    syncHumanStories() {},
    resolveActivity() {},
    clearInterval() {},
    clearInput() {},
    updateHud() {},
    renderPause() {},
    renderLobby() {},
    renderLifespanEnd() {},
    performance: { now: () => 0 },
    toast: (m: string) => c.messages.push(m),
    closeRewardAd: () => {
      c.panel = '';
      c.rewardAd = '';
    },
    writeSave: (next: any, nextRun: Game | null) => {
      if (c.blocked) throw Error('quota fixture');
      c.stored = JSON.stringify({ ...next, activeRun: nextRun?.snapshot() ?? null });
      c.writes++;
    },
    stored: JSON.stringify({ ...save, activeRun: run?.snapshot() ?? null }),
    persist: () => assert.fail('reward must use atomic write'),
  };
  const context = createContext(c);
  flow.runInContext(context);
  c.act = () =>
    context[
      kind === 'revive'
        ? 'handleRunOutcome'
        : kind === 'lifespan'
          ? 'handleLifeLimit'
          : 'handleRewardAd'
    ](
      c,
      kind === 'revive' ? 'ad-revive' : kind === 'lifespan' ? 'claim-lifespan' : 'claim-ad-reward',
    );
  return c;
}
for (const kind of ['root', 'supplies', 'revive', 'lifespan'])
  for (const location of kind === 'lifespan'
    ? ['idle', 'pending', 'active']
    : kind === 'revive'
      ? ['active']
      : ['idle', 'pending']) {
    test(
      kind + ' / ' + location + '：未看完不能领、写入失败原值不变、原位重试与连点只领取一次',
      () => {
        const c = harness(kind, location),
          before = JSON.stringify(c.save),
          stored = c.stored,
          run = c.game ?? c.pendingRun,
          snapshot = run ? JSON.stringify(run.snapshot()) : null;
        c.act();
        assert.equal(JSON.stringify(c.save), before);
        assert.equal(c.writes, 0);
        assert.equal(c.reports, 0);
        c.watched = true;
        c.act();
        assert.equal(JSON.stringify(c.save), before);
        assert.equal(c.stored, stored);
        assert.equal(c.game ?? c.pendingRun, run);
        if (run) assert.equal(JSON.stringify(run.snapshot()), snapshot);
        assert.equal(c.writes, 0);
        assert.equal(c.reports, 0, '保存失败不能上报领取');
        assert.ok(c.panel.endsWith('ad'));
        c.blocked = false;
        c.act();
        assert.equal(c.writes, 1);
        assert.equal(c.reports, 1, '真实写入并应用后只上报一次');
        const after = c.stored;
        c.act();
        assert.equal(c.writes, 1);
        assert.equal(c.reports, 1);
        assert.equal(c.stored, after);
        const read = JSON.parse(c.stored);
        assert.equal(read.spiritRoot, c.save.spiritRoot);
        assert.equal(read.stones, c.save.stones);
        assert.equal(read.iron, c.save.iron);
        assert.equal(read.lifespanBonus, c.save.lifespanBonus);
        if (kind === 'root') {
          assert.equal(c.save.spiritRoot, 'heaven');
          assert.deepEqual(c.save.rootElements, ['metal']);
          if (run) {
            assert.equal(JSON.stringify(c.pendingRun.snapshot()), snapshot);
            assert.equal(read.activeRun.spiritRoot, 'five');
          }
        }
        if (kind === 'supplies') {
          assert.equal(c.save.stones, adSupplies(c.save.unlocked).stones);
          assert.equal(c.save.iron, 30);
        }
        if (kind === 'revive') {
          assert.equal(c.game.revivesUsed, 1);
          assert.equal(c.game.player.hp, c.game.player.maxHp);
          assert.equal(read.activeRun.revivesUsed, 1);
          assert.equal(c.game.player.invincible, 3);
          assert.equal(c.game.save, c.save);
        }
        if (kind === 'lifespan') {
          assert.equal(c.save.lifespanBonus, 30);
          if (run) {
            const current = c.game ?? c.pendingRun;
            assert.equal(current.revivesUsed, 0);
            assert.equal(current.state, 'paused');
            assert.equal(current.player.hp, current.player.maxHp);
            assert.equal(current.player.invincible, 3);
            assert.equal(current.save, c.save);
            assert.equal(read.activeRun.state, 'paused');
          }
        }
      },
    );
  }
