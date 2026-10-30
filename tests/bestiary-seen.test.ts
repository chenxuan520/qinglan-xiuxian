import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, STAGES, FINAL_TRIAL_STAGE } from '../src/data.ts';
import { freshSave, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { Game } from '../src/game.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';
import { freshBestiarySeen, restoreBestiarySeen } from '../src/bestiary-seen.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { enemyCombatStats } from '../src/enemy-stats.ts';
import { formatNumber } from '../src/number-format.ts';

const mobCard = (body: string, id: number) =>
  body.match(
    new RegExp(`<article class="enemy-card" data-enemy-type="${id}">([^]*?)</article>`),
  )![1];
const bossCard = (body: string, id: number) =>
  body.match(
    new RegExp(`<article class="enemy-card" data-boss-stage="${id}">([^]*?)</article>`),
  )![1];

test('新档所有妖物只见黑色轮廓和问号，技能见闻保留，切换难度与秘境不解锁', () => {
  const save = freshSave();
  const before = JSON.stringify(save);
  for (const stage of [-1, 0, FINAL_TRIAL_STAGE])
    for (const difficulty of [0, 1, 2]) {
      const body = bestiaryPanel(stage, difficulty, save.completed, save.bestiary).body;
      for (const heading of body.matchAll(/<h3>([^<]*)<\/h3>/g)) assert.equal(heading[1], '???');
      for (const stats of body.matchAll(/<small class="enemy-stats">([^]*?)<\/small>/g)) {
        assert.match(stats[1], /气血 \?\?\?/);
        assert.match(stats[1], /触碰伤害 \?\?\?/);
        assert.doesNotMatch(stats[1], /约\d/);
      }
      assert.ok(body.includes('sprite-thumb') && body.includes('is-unseen'));
      assert.match(body, /最早 \?\?\?/);
      assert.match(body, /环形藤阵/);
    }
  assert.equal(JSON.stringify(save), before);
});

test('实际出生记录普通、精英和妖王；重复遭遇不重复记录，不把妖王当普通种类', () => {
  const save = freshSave();
  const game = new Game(save, 0, 0, () => 0.5);
  assert.deepEqual(save.bestiary, freshBestiarySeen());
  game.spawnEnemy(0);
  game.spawnEnemy(0, true);
  game.spawnEnemy(1);
  game.spawnEnemy(10, false, true, { x: 0, y: 0 }, 0);
  assert.deepEqual(save.bestiary, { enemies: [0, 1], bosses: [0] });
  const body = bestiaryPanel(0, 0, save.completed, save.bestiary).body;
  assert.match(mobCard(body, 0), new RegExp(`<h3>${ENEMIES[0].name}</h3>`));
  assert.doesNotMatch(mobCard(body, 0), /is-unseen/);
  assert.match(bossCard(body, 0), new RegExp(`<h3>${STAGES[0].boss}</h3>`));
  const actual = enemyCombatStats(0, 0, STAGES[0].minutes * 60, 10, false, true, 0);
  assert.ok(bossCard(body, 0).includes(`气血 约${formatNumber(actual.hp)}`));
  assert.match(bossCard(body, 0), /击败后可见来历/);
  assert.deepEqual(save.completed, []);
});

test('终关按原妖王身份记录，独立天劫不会误解锁执劫仙尊', () => {
  const save = freshSave();
  const trial = new Game(save, FINAL_TRIAL_STAGE, 0, () => 0.5);
  trial.spawnEnemy(10, false, true, { x: 0, y: 0 }, 2);
  assert.deepEqual(save.bestiary.bosses, [2]);
  assert.match(
    bossCard(bestiaryPanel(FINAL_TRIAL_STAGE, 0, [], save.bestiary).body, 2),
    new RegExp(`<h3>${STAGES[2].boss}</h3>`),
  );
  assert.match(
    bossCard(bestiaryPanel(FINAL_TRIAL_STAGE, 0, [], save.bestiary).body, 6),
    /<h3>\?\?\?<\/h3>/,
  );
  const other = freshSave();
  Game.createTribulation(other, null);
  assert.deepEqual(other.bestiary, freshBestiarySeen());
});

test('妖王木心、猎狼与假影不把借用的普通妖物模板当成已遇见', () => {
  for (const [stage, phase] of [
    [0, 3],
    [2, 3],
    [4, 4],
  ]) {
    const save = freshSave();
    const game = new Game(save, stage, 0, () => 0.5);
    const boss = game.spawnEnemy(10, false, true, { x: 0, y: 0 }, stage);
    boss.skillStep = phase;
    game['castBossSkill'](boss, 1, 0);
    assert.ok(game.enemies.some((enemy) => enemy.bossSummon || enemy.illusionOf !== undefined));
    assert.deepEqual(save.bestiary.enemies, []);
    assert.deepEqual(save.bestiary.bosses, [stage]);
  }
});

test('合法续局中的已在场妖物可识别，恢复过程不会解锁未见妖物或天劫仙尊', () => {
  const save = freshSave();
  const game = new Game(save, 0, 0, () => 0.5);
  game.spawnEnemy(0);
  const snapshot = game.snapshot();
  const next = structuredClone(save);
  next.bestiary = freshBestiarySeen();
  assert.ok(Game.restore(next, snapshot));
  assert.deepEqual(next.bestiary, { enemies: [0], bosses: [] });
});

test('存档往返保留遭遇记录，完全缺少字段的旧档按全部已认识导入', () => {
  const canonical = readSave(JSON.stringify(freshSave())).save;
  const game = new Game(canonical, 0, 0, () => 0.5);
  game.spawnEnemy(0);
  const imported = importSave(exportSave(canonical, game));
  assert.deepEqual(imported.save.bestiary, canonical.bestiary);
  assert.equal(imported.save.schema, SAVE_SCHEMA);
  const old = JSON.parse(JSON.stringify(canonical));
  delete old.bestiary;
  old.schema = SAVE_SCHEMA - 1;
  old.completed = [0];
  const migrated = importSave(JSON.stringify(old));
  assert.deepEqual(migrated.save.bestiary, {
    enemies: ENEMIES.map((_, id) => id),
    bosses: STAGES.map((_, id) => id),
  });
  assert.equal(migrated.save.stones, canonical.stones);
  const malformed = { ...canonical, bestiary: { enemies: [0, 0, -1, 9999, '1'], bosses: null } };
  const restored = readSave(JSON.stringify(malformed));
  assert.equal(restored.status, 'ok');
  assert.deepEqual(restored.save.bestiary.enemies, [0]);
  assert.deepEqual(restoreBestiarySeen({ enemies: [], bosses: [] }, [0]), freshBestiarySeen());
  assert.deepEqual(freshSave().bestiary, freshBestiarySeen());
});

test('只在整个字段缺失时默认全认识，显式空记录和损坏字段不会解锁', () => {
  assert.equal(restoreBestiarySeen(undefined).enemies.length, ENEMIES.length);
  assert.equal(restoreBestiarySeen(undefined).bosses.length, STAGES.length);
  for (const value of [null, {}, { enemies: [], bosses: [] }])
    assert.deepEqual(restoreBestiarySeen(value), freshBestiarySeen());
  const save = freshSave();
  assert.deepEqual(readSave(JSON.stringify(save)).save.bestiary, freshBestiarySeen());
  const without = JSON.parse(JSON.stringify(save));
  delete without.bestiary;
  const imported = importSave(JSON.stringify(without));
  const body = bestiaryPanel(-1, 0, [], imported.save.bestiary).body;
  assert.doesNotMatch(body, /is-unseen|<h3>\?\?\?<\/h3>/);
  for (const enemy of ENEMIES) assert.ok(body.includes(`<h3>${enemy.name}</h3>`));
  for (const stage of STAGES) assert.ok(body.includes(`<h3>${stage.boss}</h3>`));
  assert.match(body, /击败后可见来历/);
});
