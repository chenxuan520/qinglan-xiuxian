import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { MARKET_CULTIVATORS, marketMedicinePool } from '../src/sect-market-data.ts';
import {
  chooseMarketOpportunity,
  marketOpportunity,
  opportunityReason,
} from '../src/market-social.ts';
import { marketInvitationReward } from '../src/market-opportunities.ts';
import { medicineInfo } from '../src/medicine-data.ts';
import { treasure } from '../src/data.ts';
import { freeStarter } from '../src/auction-data.ts';
import { rememberMarketTrade } from '../src/market-relations.ts';

function fixture(seed: number) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.cultivation = 1;
  save.age = 30;
  save.stones = 10000;
  save.mortal.population = { seed, since: 15 };
  enterNextMarketBatch(save);
  return save;
}
function invitation(kind: 'medicine' | 'artifact', starter = false, honest = true) {
  for (let seed = 1; seed < 5000; seed++) {
    const save = fixture(seed);
    for (const { id } of MARKET_CULTIVATORS) {
      const offer = marketOpportunity(save, id);
      if (
        offer?.kind === 'invitation' &&
        offer.honest === honest &&
        offer.item.kind === kind &&
        (!starter || freeStarter(offer.item.id))
      )
        return { save, id, offer };
    }
  }
  throw Error('missing invitation fixture');
}

test('真实邀约明示并交付法宝或丹药：一年归来自动入账，冷却、刷新、导入均不能重复领取', () => {
  for (const kind of ['medicine', 'artifact'] as const) {
    const { save, id, offer } = invitation(kind);
    const starter = save.starter;
    assert.match(offer.title, /坊外取[宝丹]之邀/);
    assert.ok(offer.purpose.length > 20);
    const result = chooseMarketOpportunity(save, id, 1, 'accept');
    assert.equal(result?.kind, 'gift');
    assert.equal(save.age, 31);
    assert.equal(save.stones, 10000);
    assert.equal(save.starter, starter);
    assert.equal(save.mortal.marketSocial!.lastOpportunityAt, 31);
    if (kind === 'medicine') {
      assert.equal(save.medicine.bag[offer.item.id], offer.item.quantity);
      assert.match(result!.text, new RegExp(`×${offer.item.quantity} 已收入丹囊`));
    } else {
      assert.ok(save.artifacts.includes(offer.item.id));
      assert.equal(save.forge[offer.item.id], offer.item.forgeLevel);
      assert.match(result!.text, /已收入藏器阁/);
    }
    const loaded = importSave(exportSave(save, null)).save;
    const before = JSON.stringify(loaded);
    assert.equal(chooseMarketOpportunity(loaded, id, 1, 'accept'), undefined);
    assert.equal(JSON.stringify(loaded), before);
    assert.ok(enterNextMarketBatch(loaded));
    const next = MARKET_CULTIVATORS.map((n) => n.id).find((n) => marketOpportunity(loaded, n))!;
    assert.match(opportunityReason(loaded, next, 2, 'accept'), /相隔十年/);
  }
});

test('邀约奖励随修士境界而定：高阶不会混入凡品、永久丹药，法宝炼器最高四阶', () => {
  let artifacts = 0;
  let medicines = 0;
  for (let realm = 0; realm <= 7; realm++) {
    for (let seed = 1; seed < 60; seed++) {
      const population = { seed, since: 15 };
      const market = {
        visit: 3,
        openedAt: 30,
        realmIndex: realm,
        exchanged: [],
        returning: [
          {
            slot: 'market-wanderer' as const,
            birthVisit: 1,
            birthSlot: 'market-wanderer' as const,
            realmIndex: realm,
          },
        ],
      };
      const reward = marketInvitationReward(population, market, 'market-wanderer')!;
      if (reward.item.kind === 'artifact') {
        artifacts++;
        assert.equal(treasure(reward.item.id).school, 'demonic');
        assert.equal(reward.item.quantity, 1);
        assert.ok(reward.item.forgeLevel >= 1);
        assert.ok(reward.item.forgeLevel <= Math.min(4, Math.max(1, Math.ceil(realm / 2))));
      } else {
        medicines++;
        const allowed = marketMedicinePool(population, market, 'market-wanderer').filter(
          (m) => m.years > 0,
        );
        const medicine = medicineInfo(reward.item.id)!;
        assert.equal(medicine.stage, Math.max(...allowed.map((m) => m.stage)));
        assert.equal(medicine.tier, realm === 0 ? '凡品' : realm < 3 ? '灵品' : '珍品');
        assert.ok(medicine.years > 0);
        assert.equal(reward.item.quantity, realm < 3 ? 2 : 1);
      }
    }
  }
  assert.ok(artifacts > 100 && medicines > 100);
});

test('邀约奖励不因库存、当前境界、灵石、善意、核验、读档或导入而重抽', () => {
  for (const kind of ['medicine', 'artifact'] as const) {
    const { save, id, offer } = invitation(kind);
    const expected = structuredClone(offer.item);
    save.cultivation = 1e7;
    save.stones += 100000;
    save.medicine.bag.huanglong = 40;
    save.forge.sword = 7;
    rememberMarketTrade(save, id);
    assert.deepEqual(marketOpportunity(save, id)!.item, expected);
    assert.equal(marketOpportunity(save, id)!.honest, offer.honest);
    assert.ok(chooseMarketOpportunity(save, id, 1, 'inspect'));
    assert.deepEqual(marketOpportunity(save, id)!.item, expected);
    for (const loaded of [
      readSave(JSON.stringify(save)).save,
      importSave(exportSave(save, null)).save,
    ]) {
      assert.deepEqual(marketOpportunity(loaded, id)!.item, expected);
      assert.equal(marketOpportunity(loaded, id)!.honest, offer.honest);
      assert.ok(loaded.mortal.marketSocial!.inspected.includes(id));
    }
  }
});

test('同名法宝保留更高炼器、不重复入藏；重新取得已出售入门法宝会移除已售标记', () => {
  for (const owned of [false, true]) {
    const { save, id, offer } = invitation('artifact', true);
    save.artifacts = save.artifacts.filter((weapon) => weapon !== offer.item.id);
    save.artifactDrops = [offer.item.id];
    save.mortal.auction!.releasedArtifacts = [offer.item.id];
    if (owned) {
      save.artifacts.push(offer.item.id);
      save.forge[offer.item.id] = 8;
    } else save.forge[offer.item.id] = 0;
    const result = chooseMarketOpportunity(save, id, 1, 'accept')!;
    assert.ok(result);
    assert.equal(save.artifacts.filter((weapon) => weapon === offer.item.id).length, 1);
    assert.equal(save.forge[offer.item.id], owned ? 8 : offer.item.forgeLevel);
    assert.ok(!save.artifactDrops.includes(offer.item.id));
    assert.ok(!save.mortal.auction!.releasedArtifacts.includes(offer.item.id));
    if (owned) assert.match(result.text, /保留原有炼器8阶/);
    assert.equal(
      readSave(JSON.stringify(save)).save.forge[offer.item.id],
      save.forge[offer.item.id],
    );
  }
});

test('库存溢出、伪造操作、过期访次、死亡和续局都先拒绝，不能扣钱扣岁或记领取', () => {
  for (const blocked of ['overflow', 'action', 'visit', 'dead', 'run'] as const) {
    const { save, id, offer } = invitation('medicine');
    if (blocked === 'overflow') save.medicine.bag[offer.item.id] = Number.MAX_SAFE_INTEGER;
    if (blocked === 'dead') save.pendingReincarnation = 'ambush';
    const before = JSON.stringify(save);
    assert.equal(
      chooseMarketOpportunity(
        save,
        id,
        blocked === 'visit' ? 0 : 1,
        blocked === 'action' ? ('forge-accept' as 'accept') : 'accept',
        blocked === 'run',
      ),
      undefined,
      blocked,
    );
    assert.equal(JSON.stringify(save), before, blocked);
  }
});

test('伪邀约可用同样的宝物作诱饵，核验和拒绝安全；赴约才进入固定战况，不能旁路领真奖励', () => {
  for (const kind of ['medicine', 'artifact'] as const) {
    const checked = invitation(kind, false, false);
    assert.ok(chooseMarketOpportunity(checked.save, checked.id, 1, 'inspect'));
    const inspected = JSON.stringify(checked.save);
    assert.equal(chooseMarketOpportunity(checked.save, checked.id, 1, 'accept'), undefined);
    assert.equal(JSON.stringify(checked.save), inspected);
    assert.ok(chooseMarketOpportunity(checked.save, checked.id, 1, 'decline'));
    assert.equal(checked.save.stones, 10000);
    assert.equal(checked.save.mortal.marketSocial!.ambush, null);
    const { save, id } = invitation(kind, false, false);
    const inventory = JSON.stringify([save.artifacts, save.forge, save.medicine]);
    assert.equal(chooseMarketOpportunity(save, id, 1, 'accept')!.kind, 'ambush');
    assert.equal(JSON.stringify([save.artifacts, save.forge, save.medicine]), inventory);
    const pending = JSON.stringify(save);
    for (const action of ['accept', 'inspect', 'decline'] as const)
      assert.equal(chooseMarketOpportunity(save, id, 1, action), undefined);
    assert.equal(JSON.stringify(save), pending);
  }
});
