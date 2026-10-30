import { sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave, forgeCost, SAVE_SCHEMA } from '../src/progress.ts';
import { MEDICINES, medicineMarketValue } from '../src/medicine-data.ts';
import { TREASURES } from '../src/data.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import {
  marketShopQuote,
  marketShopStamp,
  executeMarketShop,
  salvageIron,
} from '../src/market-shop.ts';
import { marketShopContent } from '../src/market-shop-ui.ts';
import { validMarketVenues } from '../src/market-venue-data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { auctionValue } from '../src/auction-items.ts';
import { serviceDues } from '../src/service-preflight.ts';

function fixture(rank = 3) {
  const s = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  s.cultivation = Math.max(
    1,
    Array.from({ length: rank * 3 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0),
  );
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown.stage = 'departed';
  s.stones = 100000;
  s.age = 30;
  s.mortal.population = { seed: 12345, since: 15 };
  beginSectMarketVisit(s);
  s.medicine.bag.heqi = 5;
  s.artifacts.push('pagoda');
  s.forge.pagoda = 5;
  return readSave(JSON.stringify(s)).save;
}
const trade = (s: ReturnType<typeof fixture>, venue: 'medicine' | 'stalls', choice: string) =>
  executeMarketShop(s, venue, choice, marketShopStamp(s, venue, choice));

test('余丹调剂只收两份同名时效丹，不改药效与药方；选择在成交后保留，不能重复办理', () => {
  const s = fixture(),
    before = structuredClone(s),
    choice = 'heqi@juyuan';
  assert.equal(marketShopQuote(s, 'medicine', choice).reason, '');
  assert.ok(trade(s, 'medicine', choice));
  assert.equal(s.medicine.bag.heqi, 3);
  assert.equal(s.medicine.bag.juyuan, 1);
  assert.equal(s.stones, before.stones);
  assert.equal(s.age, before.age + 0.5);
  assert.deepEqual(s.medicine.active, before.medicine.active);
  assert.deepEqual(s.medicine.recipes, before.medicine.recipes);
  assert.equal(trade(s, 'medicine', choice), undefined);
  const html = marketShopContent(s, 'medicine', false, { from: 'heqi', to: 'juyuan' });
  assert.match(html, /value="heqi" selected/);
  assert.match(html, /value="juyuan" selected/);
  assert.match(html, /disabled>再过10年可再调剂/);
  s.medicine.bag.heqi = 0;
  assert.match(
    marketShopContent(s, 'medicine', false, { from: 'heqi', to: 'juyuan' }),
    /id="shop-from"[\s\S]*value="heqi" selected[\s\S]*<small>当前持有0份/,
  );
});
test('调剂所有同品组合均损耗估值，永久珍品、跨品、同名与不足两份不扣物', () => {
  const s = fixture();
  for (const from of MEDICINES)
    for (const to of MEDICINES) {
      s.medicine.bag[from.id] = 2;
      const q = marketShopQuote(s, 'medicine', `${from.id}@${to.id}`);
      const allowed = from.years > 0 && to.years > 0 && from.tier === to.tier && from.id !== to.id;
      assert.equal(!q.reason, allowed, `${from.id}/${to.id}`);
      if (allowed) assert.ok(medicineMarketValue(from.id) * 2 > medicineMarketValue(to.id));
    }
  for (const choice of [
    'heqi@butian',
    'heqi@huanglong',
    'heqi@heqi',
    'heqi@juyuan@extra',
    'bad@juyuan',
  ]) {
    const before = JSON.stringify(s);
    assert.equal(trade(s, 'medicine', choice), undefined);
    assert.equal(JSON.stringify(s), before);
  }
  s.medicine.bag.heqi = 1;
  assert.match(marketShopQuote(s, 'medicine', 'heqi@juyuan').reason, /不足两份/);
});
test('拆器只返累计玄铁四成；取消无结算、本命零阶不可拆，已拆对象不跳到下一件', () => {
  const s = fixture(),
    before = structuredClone(s),
    q = marketShopQuote(s, 'stalls', 'pagoda');
  assert.equal(q.receive[0].quantity, 30); // 3+9+15+21+27=75，返还30。
  assert.deepEqual(s, before, '看报价不扣除');
  assert.ok(trade(s, 'stalls', 'pagoda'));
  assert.equal(s.iron, before.iron + 30);
  assert.equal(s.stones, before.stones);
  assert.equal(s.starter, before.starter);
  assert.equal(s.forge.pagoda, 0);
  assert.ok(!s.artifacts.includes('pagoda'));
  assert.equal(trade(s, 'stalls', 'pagoda'), undefined);
  const html = marketShopContent(s, 'stalls', false, { artifact: 'pagoda' });
  assert.match(html, /value="pagoda" selected>七宝玲珑塔 · 已不在收藏/);
  assert.doesNotMatch(html, /data-action="market-venue-shop"/);
  assert.match(marketShopQuote(s, 'stalls', s.starter).reason, /本命/);
  s.artifacts.push('pagoda');
  assert.match(marketShopQuote(s, 'stalls', 'pagoda').reason, /无可回收/);
});
test('炼器后拆解以及购买后拆解都不增值，十阶和奇物折价不改变玄铁返还', () => {
  for (const t of TREASURES)
    for (let level = 0; level <= 10; level++) {
      const spent = Array.from({ length: level }, (_, i) => forgeCost(i).iron).reduce(
        (a, b) => a + b,
        0,
      );
      const returned = salvageIron(level);
      assert.equal(returned, Math.floor(spent * 0.4));
      if (level) {
        assert.ok(returned < spent);
        assert.ok(
          returned * 14 <
            auctionValue({ kind: 'artifact', id: t.id, quantity: 1, forgeLevel: level }),
        );
      }
    }
  const s = fixture();
  s.curios.bag['jade-book'] = 1;
  s.curios.acquired.push('jade-book');
  assert.equal(marketShopQuote(s, 'stalls', 'pagoda').receive[0].quantity, 30);
});
test('游商不再生成成丹货单，旧购货参数与未知场所均拒绝且不改物资', () => {
  const s = fixture();
  for (const venue of ['caravan', 'unknown'])
    for (const choice of ['0', '1', '2', 'pagoda', 'heqi@juyuan']) {
      const before = structuredClone(s);
      const q = marketShopQuote(s, venue as never, choice);
      assert.match(q.reason, /不办理购货/);
      assert.deepEqual(q.receive, []);
      assert.equal(marketShopContent(s, venue as never), '');
      assert.equal(
        executeMarketShop(s, venue as never, choice, marketShopStamp(s, venue as never, choice)),
        undefined,
      );
      assert.deepEqual(s, before);
    }
});
test('旧游商购买记录与已获丹药完整往返，但不恢复购货和额外额度', () => {
  const s = fixture();
  s.medicine.bag.mingqing = 2;
  s.mortal.marketVenues = {
    workAt: null,
    favorAt: null,
    shops: { exchangeAt: null, caravanAt: 29 },
    receipts: [{ kind: 'caravan', at: 29, text: '旧日购置远游珍匣，所得丹药已收入丹囊。' }],
  };
  const restored = importSave(exportSave(s)).save;
  assert.deepEqual(restored, sealSaveSnapshot(s));
  assert.equal(marketShopQuote(restored, 'medicine', 'heqi@juyuan').reason, '');
  assert.equal(
    executeMarketShop(
      restored,
      'caravan' as never,
      '2',
      marketShopStamp(restored, 'caravan' as never, '2'),
    ),
    undefined,
  );
  assert.deepEqual(restored, sealSaveSnapshot(s));
});
test('寿元、天劫、供奉、未结历练、落幕、数量溢出、陈旧报价均在扣费前拒绝', () => {
  for (const [venue, choice] of [
    ['medicine', 'heqi@juyuan'],
    ['stalls', 'pagoda'],
  ] as const) {
    for (const change of [
      (s: ReturnType<typeof fixture>) => {
        s.cultivation = 1;
        s.age = 99.5;
      },
      (s: ReturnType<typeof fixture>) => {
        s.nextTribulationAge = s.age + 0.5;
      },
      (s: ReturnType<typeof fixture>) => {
        s.stones = 0;
        s.mortal.member = { id: 'power', dueAt: s.mortal.years + 0.1, dues: 50 };
      },
      (s: ReturnType<typeof fixture>) => {
        s.pendingReincarnation = true;
      },
      (s: ReturnType<typeof fixture>) => {
        s.tribulationReturn = {} as never;
      },
      (s: ReturnType<typeof fixture>) => {
        s.iron = Number.MAX_SAFE_INTEGER;
        for (const m of MEDICINES) s.medicine.bag[m.id] = Number.MAX_SAFE_INTEGER;
      },
    ]) {
      const s = fixture();
      change(s);
      const before = JSON.stringify(s);
      assert.equal(trade(s, venue, choice), undefined, venue);
      assert.equal(JSON.stringify(s), before);
    }
    const s = fixture(),
      stamp = marketShopStamp(s, venue, choice);
    s.age += 10;
    const before = JSON.stringify(s);
    assert.equal(executeMarketShop(s, venue, choice, stamp), undefined);
    assert.equal(JSON.stringify(s), before);
  }
});
test('供奉使用全程预留，不能用成交所得垫付；真正交割后读档保持冷却与收据', () => {
  const s = fixture();
  s.path = 'orthodox';
  s.mortal.member = { id: 'power', dueAt: s.mortal.years + 0.25, dues: 50 };
  const q = marketShopQuote(s, 'medicine', 'heqi@juyuan');
  assert.equal(q.reserve, serviceDues(s, 0.5));
  assert.ok(q.reserve > 0);
  s.stones = q.stones + q.reserve - 1;
  assert.equal(trade(s, 'medicine', 'heqi@juyuan'), undefined);
  s.stones++;
  assert.ok(trade(s, 'medicine', 'heqi@juyuan'));
  assert.equal(s.stones, 0);
  assert.deepEqual(importSave(exportSave(s)).save, sealSaveSnapshot(s));
});
test('旧档新增商铺额度默认为未用；同版本往返保留，非法冷却拒绝且不清旧档进度', () => {
  const s = fixture();
  s.mortal.marketVenues = { workAt: 29, favorAt: null, receipts: [] };
  s.schema = SAVE_SCHEMA - 1;
  const migrated = readSave(JSON.stringify(s)).save;
  assert.equal(migrated.schema, SAVE_SCHEMA);
  assert.equal(migrated.stones, s.stones);
  assert.equal(migrated.mortal.marketVenues!.workAt, 29);
  assert.equal(marketShopQuote(migrated, 'medicine', 'heqi@juyuan').reason, '');
  trade(migrated, 'medicine', 'heqi@juyuan');
  assert.deepEqual(importSave(exportSave(migrated)).save, sealSaveSnapshot(migrated));
  assert.ok(validMarketVenues(migrated.mortal.marketVenues, migrated.age));
  for (const at of [-1, NaN, Infinity, migrated.age + 1])
    assert.equal(
      validMarketVenues(
        { ...migrated.mortal.marketVenues, shops: { exchangeAt: at, caravanAt: null } },
        migrated.age,
      ),
      false,
    );
});
