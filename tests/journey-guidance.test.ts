import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshSave,
  forge,
  forgeCost,
  forgeDamageBonus,
  train,
  trainingCost,
  trainingYears,
  lifespanInfo,
  IMMORTAL_CULTIVATION,
} from '../src/progress.ts';
import { preparationAdvice, preparationAdviceContent } from '../src/preparation-advice.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { useMedicine } from '../src/medicine.ts';
import { humanRecollection, humanRevisitText } from '../src/human-recollection.ts';
import { chooseHumanStory, HUMAN_STORIES, HUMAN_STORY_IDS } from '../src/human-stories.ts';
import { chooseSmithStory, smithAt } from '../src/town-story.ts';
import { visitHometown, readHometownLetter } from '../src/hometown.ts';
import { homeTownEntrance } from '../src/home-town.ts';
import { humanStoryJournal, townEventContent } from '../src/mortal-ui.ts';
import { townResidents } from '../src/town-population.ts';
import { settlementPlaces, settlementDirectory } from '../src/settlement-directory.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { prepareAuction } from '../src/auction.ts';
import { marketShopQuote, executeMarketShop, marketShopStamp } from '../src/market-shop.ts';
import { MARKET_BUILDINGS } from '../src/sect-market-data.ts';

function fixture() {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown.stage = 'departed';
  save.mortal.population = { seed: 12345, since: 15 };
  save.age = 20;
  return save;
}

test('准备建议的本命报价可真实执行，折扣、阶数和伤害比较与炼器一致，阅读不扣物', () => {
  for (const discounted of [false, true])
    for (const level of [0, 4, 9]) {
      const s = fixture();
      s.forge[s.starter] = level;
      if (discounted) s.curios.bag['jade-book'] = 1;
      const cost = forgeCost(level, s);
      s.stones = cost.stones;
      s.iron = cost.iron;
      const before = structuredClone(s);
      const hint = preparationAdvice(s)!;
      assert.equal(hint.kind, 'forge');
      assert.match(hint.text, new RegExp(`${cost.stones}灵石、${cost.iron}玄铁`));
      assert.ok(
        hint.text.includes(
          (((1 + forgeDamageBonus(level + 1)) / (1 + forgeDamageBonus(level)) - 1) * 100).toFixed(
            1,
          ) + '%',
        ),
      );
      assert.match(preparationAdviceContent(s), new RegExp(`data-id="${s.starter}"`));
      assert.doesNotMatch(preparationAdviceContent(s, false, true), /data-action=/);
      assert.deepEqual(s, before);
      assert.equal(forge(s, hint.id), true);
      assert.equal(s.stones, 0);
      assert.equal(s.iron, 0);
      assert.equal(s.forge[s.starter], level + 1);
      assert.equal(s.age, before.age);
    }
});

test('准备建议避开缺料和满阶，按可承担的较低阶根基取舍，并守住寿元边界', () => {
  const s = fixture();
  s.training = { vitality: 20, power: 4, speed: 2 };
  s.iron = 0;
  s.stones = trainingCost(2, s);
  assert.match(preparationAdvice(s)!.text, /身法修至3阶/);
  const before = structuredClone(s);
  assert.equal(train(s, 'speed'), true);
  assert.equal(s.age - before.age, trainingYears(before));
  assert.equal(s.stones, 0);
  assert.equal(preparationAdvice(s), null);
  s.stones = 100000;
  s.forge[s.starter] = 10;
  s.age = lifespanInfo(s).limit - trainingYears(s);
  assert.equal(preparationAdvice(s), null);
  s.curios.bag['heaven-house'] = 1;
  const zeroYear = structuredClone(s);
  assert.match(preparationAdvice(zeroYear)!.text, /0年/);
  const zeroAge = zeroYear.age;
  assert.equal(train(zeroYear, 'speed'), true);
  assert.equal(zeroYear.age, zeroAge);
  assert.equal(s.stones - zeroYear.stones, trainingCost(s.training.speed, s));
  s.training = { vitality: 20, power: 20, speed: 20 };
  s.age = 20;
  assert.equal(preparationAdvice(s), null);
});

test('药囊建议只统计实际可服的未生效时效丹，满槽与续局不诱导服药', () => {
  const s = fixture();
  s.stones = s.iron = 0;
  s.medicine.bag.heqi = 2;
  s.medicine.bag.juyuan = 1;
  const before = structuredClone(s);
  assert.match(preparationAdvice(s)!.text, /2种/);
  assert.deepEqual(s, before);
  assert.equal(useMedicine(s, 'heqi').ok, true);
  assert.match(preparationAdvice(s)!.text, /1种/);
  assert.equal(preparationAdvice(s, true), null);
  for (const m of MEDICINES.filter((m) => m.years && !['heqi', 'juyuan'].includes(m.id)).slice(
    0,
    2,
  ))
    s.medicine.active[m.id] = s.age + m.years;
  assert.equal(preparationAdvice(s), null);
  s.medicine.active = {};
  s.medicine.bag = { butian: 1 };
  assert.equal(preparationAdvice(s), null, '不主动推荐不可逆的本世珍品');
});

test('结算准备提示在寿尽、欠费、天劫、落幕时收起', () => {
  const original = fixture();
  original.stones = original.iron = 100000;
  for (const change of [
    (s: typeof original) => {
      s.age = lifespanInfo(s).limit;
    },
    (s: typeof original) => {
      s.mortal.member = { id: 'power', dueAt: s.mortal.years, dues: 50 };
    },
    (s: typeof original) => {
      s.cultivation = IMMORTAL_CULTIVATION;
      s.nextTribulationAge = s.age;
    },
    (s: typeof original) => {
      s.journeyEnded = true;
    },
    (s: typeof original) => {
      s.pendingReincarnation = 'lifespan';
    },
  ]) {
    const s = structuredClone(original);
    change(s);
    assert.equal(preparationAdviceContent(s), '');
  }
});

test('返乡提示不揭未相识旧事或未发现的家书，读信后立即消失', () => {
  const s = fixture();
  s.age = 500;
  assert.equal(humanRecollection(s), '');
  assert.doesNotMatch(homeTownEntrance(s), /檐下春灯|炉火未凉|旧信|家书|去世/);
  assert.equal(visitHometown(s), true);
  const before = structuredClone(s);
  assert.match(humanRecollection(s), /1封旧信/);
  assert.deepEqual(s, before);
  assert.equal(readHometownLetter(s), true);
  assert.equal(humanRecollection(s), '');
});

test('三段已结识旧事严格随真实阶段提示，回访、辞世与已读不会继续催访', () => {
  for (const id of HUMAN_STORY_IDS) {
    const s = fixture();
    assert.equal(humanRevisitText(s, id), '');
    assert.equal(chooseHumanStory(s, id, 'meet'), true);
    s.age += HUMAN_STORIES[id].years - 0.01;
    assert.equal(humanRevisitText(s, id), '');
    s.age += 0.01;
    assert.match(humanRevisitText(s, id), /再叙旧/);
    assert.ok(humanStoryJournal(s).includes(humanRevisitText(s, id)));
    assert.equal(chooseHumanStory(s, id, HUMAN_STORIES[id].choices[0].id), true);
    assert.equal(humanRevisitText(s, id), '');
    s.age += 5;
    assert.match(humanRecollection(s), /再叙旧/);
    assert.equal(chooseHumanStory(s, id, 'visit'), true);
    assert.equal(humanRevisitText(s, id), '');
    s.age = s.mortal.humanStories![id]!.endsAt;
    assert.equal(humanRevisitText(s, id), '');
    assert.match(humanRecollection(s), /1封旧信/);
    assert.equal(chooseHumanStory(s, id, 'read'), true);
    assert.equal(humanRecollection(s), '');
  }
});

test('炉火只在真正结识并换代后提示，完成后保留旧事而不重复提示领取', () => {
  const s = fixture();
  assert.equal(chooseSmithStory(s, 'bellows'), true);
  assert.equal(humanRecollection(s), '');
  s.age = smithAt(s.mortal.population!, s.age).leavesAt;
  assert.match(humanRecollection(s), /炉火未凉/);
  assert.equal(chooseSmithStory(s, 'school'), true);
  assert.equal(humanRecollection(s), '');
  s.age = smithAt(s.mortal.population!, s.age).leavesAt;
  assert.match(humanRecollection(s), /炉火未凉/);
  assert.equal(chooseSmithStory(s, 'remember'), true);
  assert.equal(humanRecollection(s), '');
});

test('去处清单覆盖镇民与全部坊中建筑，使用实际事务报价且只读', () => {
  const s = fixture();
  s.cultivation = 1;
  s.stones = 100000;
  s.medicine.bag.heqi = 2;
  beginSectMarketVisit(s);
  prepareAuction(s);
  const before = structuredClone(s);
  const market = settlementPlaces(s, true);
  assert.deepEqual(market.map((x) => x.name).sort(), MARKET_BUILDINGS.map((x) => x.label).sort());
  assert.equal(settlementPlaces(s).length, 10);
  assert.match(market.find((x) => x.name === '丹药铺')!.status!, /有可办理/);
  assert.equal(marketShopQuote(s, 'medicine', 'heqi@juyuan').reason, '');
  assert.doesNotMatch(settlementDirectory(s), /檐下春灯|炉火未凉|同心旧结/);
  assert.deepEqual(s, before);
  assert.ok(
    executeMarketShop(s, 'medicine', 'heqi@juyuan', marketShopStamp(s, 'medicine', 'heqi@juyuan')),
  );
  s.medicine.bag.heqi = 2;
  assert.match(settlementPlaces(s, true).find((x) => x.name === '丹药铺')!.status!, /再过10年/);
  assert.match(settlementPlaces(s, true, true).find((x) => x.name === '丹药铺')!.status!, /未完成/);
});

test('去处清单的凡人门槛、零物资和本命保护不冒充可办理', () => {
  const s = fixture();
  assert.ok(settlementPlaces(s, true).every((x) => x.status === '踏入炼气后开放'));
  s.cultivation = 1;
  beginSectMarketVisit(s);
  prepareAuction(s);
  s.medicine.bag = {};
  s.stones = s.iron = 0;
  assert.match(settlementPlaces(s, true).find((x) => x.name === '丹药铺')!.status!, /尚无两份/);
  s.forge[s.starter] = 10;
  assert.match(settlementPlaces(s, true).find((x) => x.name === '散修摊')!.status!, /尚无/);
  assert.doesNotMatch(
    settlementPlaces(s, true).find((x) => x.name === '游商摊')!.status!,
    /有可办理/,
  );
});

test('茶馆旧书为主动独立阅读入口，不改写玩家身份、不替代听书结算', () => {
  const s = fixture();
  const before = structuredClone(s);
  const tea = townResidents(s.mortal.population!, s.age).find((n) => n.id === 'tea')!;
  const html = townEventContent(s, tea);
  assert.match(html, /href="[^\"]*novel\/" target="_blank" rel="noopener"/);
  assert.match(html, /陆迟的故事已成旧闻，你仍可走自己的路/);
  assert.match(html, /data-action="mortal-activity" data-id="tea"/);
  assert.match(html, /消耗 0.5 年/);
  assert.deepEqual(s, before);
});
