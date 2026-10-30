import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost } from '../src/progress.ts';
import { CURIO_IDS, forecastCurioConsignment } from '../src/curio-data.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { forecastPermanentMedicine } from '../src/auction-trade.ts';
import { MEDICINES, medicineInfo } from '../src/medicine-data.ts';
import { dockRumorPool, dockRumors } from '../src/dock-rumors.ts';

function fixture(seed = 6) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  save.age = 30;
  save.cultivation = Array.from({ length: 18 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0);
  save.mortal.population = { seed, since: 15 };
  save.mortal.scenery = { lastVisitAge: save.age, revision: 0 };
  assert.equal(beginSectMarketVisit(save), true);
  return save;
}

test('船客传闻原文按已确认附件保留，万魂幡不进入随机池', () => {
  const expected = {
    immortal:
      '老辈人说，久不归乡的修士回来，街上偶尔会多出个面生的人。肯上前搭话的，总能捎点什么走。',
    ambush: '坊里有人请你去城外看货，多半没安好心。前些年有个修士去了，船上就再没见过他。',
    bottle: '上游有个修士喝醉了，说世上有只瓶子能装下一片天。旁人都笑他，他自己倒不笑。',
    rootless: '都说没有灵根修不成仙。可我在船上载过一位，自称当年就是个凡骨。',
    'lu-boatman':
      '早年这码头上有户船工姓陆，儿子后来修成了仙。最后一回来，只在石阶上坐了一会儿，送了渡口一个少年一样东西，就再没见过他。',
    ruyi: '听说那样东西是一柄玉如意，边上磨出了浅痕。后来流到哪儿去了，谁也说不清。',
    zhehuo:
      '落霞古墟里有条旧道，叫折火道。早年有人拿着带封签的旧匣子四处卖，说里头是仙丹。买的人，后来大多后悔了。',
    'night-boat':
      '有时候夜里，码头会多出一条船，不点灯，也不说从哪儿来。天亮前就走了。有人说上去换过东西，换了什么，他不肯讲。',
    fishing:
      '渔夫说这条河什么都钓得上来，几十年前谁失手掉下去的东西，也算在里头。就是得有耐性陪他坐着。',
  };
  const save = fixture();
  const pool = dockRumorPool(save);
  for (const [key, text] of Object.entries(expected))
    assert.equal(pool.find((rumor) => rumor.key === key)?.text, text, key);
  assert.equal(
    pool.some((rumor) => rumor.key === 'ranking' || rumor.href),
    false,
  );
  const ranking = dockRumors(save, true)[0];
  assert.deepEqual(ranking, {
    key: 'ranking',
    text: '下游有座山上祭着一面幡，收的全是修士的名号。听说道行越深，名字挂得越高，也不知图个什么。',
    href: 'https://xiuxian.011203.xyz/leaderboard/',
  });
});

test('一次入镇三条互异且固定，万魂幡开启首条常驻，关闭及非官网不携带条目或链接', () => {
  const save = fixture();
  const before = structuredClone(save);
  const off = dockRumors(save, false);
  const on = dockRumors(save, true);
  assert.equal(off.length, 3);
  assert.equal(on.length, 3);
  assert.equal(new Set(off.map((rumor) => rumor.key)).size, 3);
  assert.equal(new Set(on.map((rumor) => rumor.key)).size, 3);
  assert.equal(on[0].key, 'ranking');
  assert.deepEqual(on.slice(1), off.slice(0, 2));
  assert.equal(
    off.some((rumor) => rumor.key === 'ranking' || rumor.href),
    false,
  );
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(dockRumors(save, false), off);
    assert.deepEqual(dockRumors(save, true), on);
  }
  assert.deepEqual(save, before, '传闻不写存档或新建持久字段');
  save.age += 50;
  save.stones += 100;
  assert.deepEqual(dockRumors(save, false), off, '本次入镇锚点不跟随闲逛时年岁跳动');
  const results = new Set<string>();
  for (let visit = 1; visit <= 12; visit++) {
    save.mortal.scenery!.lastVisitAge = save.age + visit;
    const result = dockRumors(save, false);
    results.add(JSON.stringify(result));
    assert.equal(
      result.some((rumor) => rumor.key === 'ranking' || rumor.href),
      false,
    );
  }
  assert.ok(results.size > 1, '下一次入镇才使用新的抽选种子，允许偶然重抽同条目');
  const returned = dockRumors(save, true);
  returned[0].text = 'caller mutation';
  assert.notEqual(dockRumors(save, true)[0].text, 'caller mutation');
});

test('已得掌天瓶不再进入池，预告无结果不入池且抽选不补虚假预告', () => {
  const save = fixture(4);
  assert.equal(forecastPermanentMedicine(save), null);
  save.curios.acquired = [...CURIO_IDS];
  const before = structuredClone(save);
  assert.equal(forecastCurioConsignment(save), null);
  const pool = dockRumorPool(save);
  assert.equal(pool.length, 8);
  for (const key of ['bottle', 'forecast-curio', 'forecast-medicine'])
    assert.equal(
      pool.some((rumor) => rumor.key === key),
      false,
    );
  for (let seed = 0; seed < 64; seed++) {
    save.mortal.population!.seed = seed;
    const withoutMedicine = forecastPermanentMedicine(save) === null;
    const selected = dockRumors(save, false);
    assert.equal(selected.length, 3);
    assert.equal(
      selected.some((rumor) => rumor.key === 'bottle' || rumor.key === 'forecast-curio'),
      false,
    );
    if (withoutMedicine)
      assert.equal(
        selected.some((rumor) => rumor.key === 'forecast-medicine'),
        false,
      );
  }
  save.mortal.population!.seed = before.mortal.population!.seed;
  assert.deepEqual(save, before);
  const legacy = fixture();
  legacy.curios.bag['heaven-bottle'] = 0;
  assert.equal(
    dockRumorPool(legacy).some((rumor) => rumor.key === 'bottle'),
    false,
  );
});

test('奇物预告模糊年数五档边界使用已确认原文且不泄漏掌天瓶寄拍', () => {
  for (const [years, span] of [
    [15, '十来年'],
    [15.001, '二三十年'],
    [35, '二三十年'],
    [35.001, '五六十年'],
    [70, '五六十年'],
    [70.001, '百来年'],
    [150, '百来年'],
    [150.001, '两三百年'],
    [280, '两三百年'],
  ] as const) {
    const save = freshSave();
    save.age = 295 - years;
    save.curios.seed = 0;
    save.curios.acquired = [...CURIO_IDS.slice(2)];
    const forecast = forecastCurioConsignment(save)!;
    assert.equal(forecast.id, 'soul-wood');
    assert.ok(Math.abs(forecast.years - years) < 1e-8);
    const rumor = dockRumorPool(save).find((item) => item.key === 'forecast-curio')!;
    assert.equal(
      rumor.text,
      `船上有个跑拍卖的伙计说，再过${span}，坊里拍卖会会有人寄拍一件养魂木。地字场、天字场才摆得出来，得是够格进场的修士才见得着。`,
    );
    assert.equal(rumor.text.includes('掌天瓶'), false);
  }
});

test('本世珍品预告三档开市次数保持原文，首次显露前隐名，库存零仍认得', () => {
  for (const [seed, visits, span] of [
    [6, 1, '下回开市'],
    [0, 2, '再开两三回市'],
    [12, 3, '再开两三回市'],
    [9, 4, '过些回开市'],
    [106, 10, '过些回开市'],
  ] as const) {
    const save = fixture(seed);
    const forecast = forecastPermanentMedicine(save)!;
    assert.equal(forecast.visits, visits);
    const before = structuredClone(save);
    const hidden = dockRumorPool(save).find((rumor) => rumor.key === 'forecast-medicine')!;
    assert.equal(
      hidden.text,
      `坊里的人说，${span}，天字场会有人寄拍一枚说不上名字的珍品丹。天字场只放合体以上的修士进去。`,
    );
    for (const medicine of MEDICINES.filter((medicine) => !medicine.years))
      assert.equal(hidden.text.includes(medicine.name), false);
    assert.deepEqual(save, before);
    save.medicine.bag[forecast.id] = 0;
    const known = dockRumorPool(save).find((rumor) => rumor.key === 'forecast-medicine')!;
    assert.equal(
      known.text,
      `坊里的人说，${span}，天字场会有人寄拍${medicineInfo(forecast.id)!.name}。天字场只放合体以上的修士进去。`,
    );
  }
});
