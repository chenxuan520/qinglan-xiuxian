import { sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { seekArtifact, seekingQuote, seekingOptions } from '../src/artifact-seeking.ts';
import { seekingChance, seekingPrice } from '../src/seeking-chance.ts';
import { venueStamp } from '../src/market-venues.ts';
import { validMarketVenues } from '../src/market-venue-data.ts';
import { joinSect } from '../src/mortal.ts';
import { executeSectService, sectServiceStamp } from '../src/sect-services.ts';
import { TREASURES } from '../src/data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
function ready(seed = 0) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  for (const t of TREASURES) s.forge[t.id] = 0;
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown!.stage = 'departed';
  s.unlocked = 6;
  s.stones = 100000;
  s.curios.seed = seed;
  s.mortal.population = { seed: 12345, since: 15 };
  s.mortal.sectMarket = { visit: 1, openedAt: 15, realmIndex: 6, exchanged: [] };
  return s;
}
test('每件物品各有十年行情，短进出/读档不换机会，机会越高报价越高且不必得', () => {
  const s = ready();
  const odds = new Set<number>();
  for (let cycle = 2; cycle < 14; cycle++) {
    s.age = cycle * 10;
    for (const t of TREASURES) {
      const q = seekingQuote(s, t.id);
      odds.add(q.chance);
      assert.ok(q.chance >= 35 && q.chance <= 70);
      const reopened = structuredClone(s);
      reopened.mortal.sectMarket!.visit++;
      assert.equal(seekingQuote(reopened, t.id).chance, q.chance);
      assert.equal(seekingQuote(readSave(JSON.stringify(s)).save, t.id).chance, q.chance);
      const sect = seekingChance(s, `artifact:${t.id}`, true);
      assert.equal(sect, q.chance + 5);
      assert.ok(sect < 100);
    }
  }
  assert.deepEqual(
    [...odds].sort((a, b) => a - b),
    [35, 40, 45, 50, 55, 60, 65, 70],
  );
  for (let chance = 35; chance < 70; chance += 5)
    assert.ok(seekingPrice(180, chance + 5) > seekingPrice(180, chance));
});
test('完整固定种子同时覆盖获得和落空，两者都付费一年并保存次数/共享十年额度', () => {
  const outcomes = new Set<boolean>();
  for (let seed = 0; seed < 64; seed++) {
    const s = ready(seed),
      before = structuredClone(s),
      q = seekingQuote(s, 'pagoda');
    const text = seekArtifact(s, 'pagoda', venueStamp(s));
    assert.ok(text);
    const found = s.artifacts.includes('pagoda');
    outcomes.add(found);
    assert.equal(text.includes('未能寻得'), !found);
    assert.equal(s.stones, before.stones - q.price);
    assert.equal(s.age, before.age + 1);
    assert.equal(s.mortal.marketVenues!.seeking!['artifact:pagoda'], 1);
    assert.equal(s.mortal.marketVenues!.workAt, s.age);
    assert.equal(s.starter, before.starter);
    if (found) assert.equal(s.forge.pagoda, 0);
    else assert.equal(s.forge.pagoda, before.forge.pagoda);
    assert.deepEqual(importSave(exportSave(s)).save, sealSaveSnapshot(s));
    const snapshot = JSON.stringify(s);
    assert.equal(seekArtifact(s, 'fire', venueStamp(s)), undefined);
    assert.equal(JSON.stringify(s), snapshot);
  }
  assert.deepEqual(outcomes, new Set([false, true]));
});
test('同物同次换入口/恢复写档前副本不重抽，宗门失败不假报入藏；两入口共享次数', () => {
  let failed = 0,
    found = 0;
  for (let seed = 0; seed < 32; seed++) {
    const s = ready(seed);
    assert.ok(joinSect(s, 'power'));
    const id = seekingOptions(s, true)[0].id;
    const a = structuredClone(s),
      b = structuredClone(s);
    assert.equal(
      seekArtifact(a, id, venueStamp(a), true),
      seekArtifact(b, id, venueStamp(b), true),
    );
    assert.deepEqual(a, b);
    assert.equal(s.mortal.marketVenues, undefined);
    const result = executeSectService(s, id, sectServiceStamp(s));
    assert.ok(result);
    const has = s.artifacts.includes(id);
    has ? found++ : failed++;
    assert.equal(result.includes('未能寻得'), !has);
    assert.equal(s.mortal.sectServices!.receipts[0].text, result);
    assert.equal(s.mortal.marketVenues!.seeking![`artifact:${id}`], 1);
    s.age += 10;
    if (!has) {
      seekArtifact(s, id, venueStamp(s));
      assert.equal(s.mortal.marketVenues!.seeking![`artifact:${id}`], 2);
    }
  }
  assert.ok(failed > 0 && found > 0);
});
test('任一合法行情的期望出售净回款低于单次酬金，宗门优惠仍无正期望循环', () => {
  for (const value of [30, 180, 360, 1600, 8000, 100000])
    for (let chance = 35; chance <= 75; chance += 5) {
      for (const tier of [undefined, 0, 1, 2]) {
        const cost = seekingPrice(value, chance, tier);
        const expectedNet = (value * 0.9 * chance) / 100;
        assert.ok(cost > expectedNet);
      }
    }
});
test('尝试次数持久化并校验，旧档缺失为零；非法物品键和溢出次数拒绝', () => {
  const s = ready();
  s.mortal.marketVenues = {
    workAt: null,
    favorAt: null,
    receipts: [],
    seeking: { 'artifact:pagoda': 3, 'medicine:heqi': 4 },
  };
  assert.ok(validMarketVenues(s.mortal.marketVenues, s.age));
  assert.deepEqual(importSave(exportSave(s)).save.mortal.marketVenues, s.mortal.marketVenues);
  for (const seeking of [
    { 'artifact:made-up': 1 },
    { 'artifact:pagoda': -1 },
    { 'artifact:pagoda': 1.5 },
    { 'artifact:pagoda': Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.equal(validMarketVenues({ ...s.mortal.marketVenues, seeking }, s.age), false);
  const old = ready();
  old.schema = SAVE_SCHEMA - 1;
  assert.equal(readSave(JSON.stringify(old)).save.mortal.marketVenues?.seeking, undefined);
  s.mortal.marketVenues.seeking = { 'artifact:pagoda': Number.MAX_SAFE_INTEGER };
  const before = JSON.stringify(s);
  assert.match(seekingQuote(s, 'pagoda').reason, /记载已满/);
  assert.equal(seekArtifact(s, 'pagoda', venueStamp(s)), undefined);
  assert.equal(JSON.stringify(s), before);
});
