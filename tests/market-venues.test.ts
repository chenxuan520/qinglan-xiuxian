import { sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, realmCost, readSave, SAVE_SCHEMA } from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import { sectMarketDeals, exchangeSectMedicine } from '../src/sect-market.ts';
import {
  MARKET_VENUES,
  MARKET_BUILDINGS,
  MARKET_WIDTH,
  MARKET_HEIGHT,
  MARKET_START,
} from '../src/sect-market-data.ts';
import {
  venueActionReason,
  venueFavor,
  venueHostTopics,
  venuePeople,
  venueSeekOffers,
  venueStamp,
  venueWork,
  executeVenue,
} from '../src/market-venues.ts';
import { marketVenueContent } from '../src/market-venue-ui.ts';
import { marketVenueAction } from '../src/market-venue-flow.ts';
import { validMarketVenues } from '../src/market-venue-data.ts';
import { marketContact, rememberMarketAid, rememberMarketTrade } from '../src/market-relations.ts';
import { townWalkable } from '../src/town.ts';
import { marketDialogueContext } from '../src/npc-chat.ts';
import { validDialogue, dialogueMessages } from '../workers/npc-ai/index.ts';
import { TREASURES, ROOT_STARTERS } from '../src/data.ts';
import { Game } from '../src/game.ts';
import { mountTownScene, showMarketVenue } from '../src/scene-flow.ts';

function fixture(rank = 4, seed = 12345) {
  const s = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  s.cultivation = Math.max(
    1,
    Array.from({ length: rank * 3 }, (_, i) => realmCost(i)).reduce((a, b) => a + b, 0),
  );
  s.prologueSeen = s.hometownSeen = true;
  s.mortal.hometown!.stage = 'departed';
  if (rank === 7) s.nextTribulationAge = s.age + 20000;
  s.unlocked = 6;
  s.stones = 100000;
  s.mortal.population = { seed, since: 15 };
  for (const t of TREASURES) s.forge[t.id] = 0;
  for (const m of MEDICINES) s.medicine.bag[m.id] = 20;
  s.medicine.recipes = MEDICINES.filter((m) => m.years > 0 && m.tier !== '凡品').map((m) => m.id);
  enterNextMarketBatch(s);
  return s;
}
function reunion(rank = 4) {
  const s = fixture(rank);
  const id = venuePeople(s)[0].id;
  const deal = sectMarketDeals(s, id).find((d) => d.give.every((i) => i.kind === 'medicine'))!;
  for (const i of deal.give) s.medicine.bag[i.id] = i.quantity + 20;
  assert.ok(exchangeSectMedicine(s, id, deal.id, s.mortal.sectMarket!.visit));
  enterNextMarketBatch(s);
  enterNextMarketBatch(s);
  assert.ok(venueFavor(s));
  return s;
}
test('七处建筑门前都可从中央街口步行抵达，拓宽范围但不改变青岚镇碰撞', () => {
  assert.equal(MARKET_WIDTH, 2000);
  assert.equal(MARKET_HEIGHT, 1400);
  const visited = new Set<string>();
  const queue = [{ x: MARKET_START.x, y: MARKET_START.y }];
  const key = (x: number, y: number) => `${x},${y}`;
  visited.add(key(queue[0].x, queue[0].y));
  for (const p of queue)
    for (const [dx, dy] of [
      [20, 0],
      [-20, 0],
      [0, 20],
      [0, -20],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (
        n.x < 24 ||
        n.y < 24 ||
        n.x > MARKET_WIDTH - 24 ||
        n.y > MARKET_HEIGHT - 24 ||
        !townWalkable(n, MARKET_BUILDINGS, 260) ||
        visited.has(key(n.x, n.y))
      )
        continue;
      visited.add(key(n.x, n.y));
      queue.push(n);
    }
  for (const venue of MARKET_VENUES) {
    assert.ok(townWalkable(venue, MARKET_BUILDINGS, 260));
    assert.ok(
      queue.some((p) => Math.hypot(p.x - venue.x, p.y - venue.y) < 30),
      venue.id,
    );
  }
});
test('托付随境界变为护送/压阵/调停，报酬有限、十年共享额度跨访次和读档保留', () => {
  for (const rank of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const s = fixture(rank);
    const before = structuredClone(s),
      stamp = venueStamp(s);
    assert.equal(venueWork(s).title, rank < 2 ? '护送药囊' : rank < 4 ? '交割压阵' : '主持调停');
    assert.ok(executeVenue(s, 'work', stamp));
    assert.equal(s.stones, before.stones + 40);
    assert.equal(s.iron, before.iron + 1);
    assert.equal(s.cultivation, before.cultivation);
    assert.equal(s.age, before.age + venueWork(before).years);
    const settled = JSON.stringify(s);
    assert.equal(executeVenue(s, 'work', venueStamp(s)), undefined);
    assert.equal(JSON.stringify(s), settled);
    enterNextMarketBatch(s);
    assert.match(venueActionReason(s, 'work', venueStamp(s)), /再过/);
    assert.deepEqual(readSave(JSON.stringify(s)).save.mortal.marketVenues, s.mortal.marketVenues);
  }
});
test('寻物只在化神开放，成本与物品同存，本命不变、不会买入重复且无提升的法宝', () => {
  assert.equal(venueSeekOffers(fixture(3)).length, 0);
  let checkedArtifact = false;
  for (let seed = 1; seed <= 20; seed++) {
    const s = fixture(4, seed);
    for (const offer of venueSeekOffers(s)) {
      const a = structuredClone(s);
      const starter = a.starter;
      if (offer.item.kind === 'artifact') {
        checkedArtifact = true;
        if (!a.artifacts.includes(offer.item.id)) a.artifacts.push(offer.item.id);
        a.forge[offer.item.id] = offer.item.forgeLevel;
        assert.match(venueActionReason(a, `seek@${offer.npc.id}`, venueStamp(a)), /无需重复/);
        a.forge[offer.item.id] = 9;
        assert.match(venueActionReason(a, `seek@${offer.npc.id}`, venueStamp(a)), /无需重复/);
        a.forge[offer.item.id] = 0;
        a.artifacts = a.artifacts.filter((id) => id !== offer.item.id);
        a.mortal.auction = {
          hall: 0,
          visit: a.mortal.sectMarket!.visit,
          closed: [],
          releasedArtifacts: Object.values(ROOT_STARTERS).some((ids) => ids.includes(offer.item.id))
            ? [offer.item.id]
            : [],
          history: [],
        };
      }
      if (venueActionReason(a, `seek@${offer.npc.id}`, venueStamp(a))) continue;
      const before = structuredClone(a);
      const result = executeVenue(a, `seek@${offer.npc.id}`, venueStamp(a));
      assert.ok(result);
      const found = !result.includes('未能寻得');
      assert.equal(a.mortal.marketVenues?.seeking?.[offer.key], 1);
      assert.equal(a.age, before.age + 1);
      assert.equal(a.stones, before.stones - offer.price);
      assert.equal(a.starter, starter);
      if (offer.item.kind === 'medicine')
        assert.equal(
          a.medicine.bag[offer.item.id],
          before.medicine.bag[offer.item.id] + (found ? 1 : 0),
        );
      else {
        assert.equal(
          a.forge[offer.item.id],
          found ? offer.item.forgeLevel : before.forge[offer.item.id],
        );
        assert.equal(a.artifacts.includes(offer.item.id), found);
        assert.equal(
          a.artifactDrops.includes(offer.item.id),
          !found && before.artifactDrops.includes(offer.item.id),
        );
        assert.equal(
          a.mortal.auction!.releasedArtifacts.includes(offer.item.id),
          !found && before.mortal.auction!.releasedArtifacts.includes(offer.item.id),
        );
      }
      assert.deepEqual(importSave(exportSave(a, null)).save, sealSaveSnapshot(a));
    }
  }
  assert.ok(checkedArtifact);
});
test('讲法只指点真实较低来客、只讲已知丹方；花一年30灵石，共用原论道十年间隔', () => {
  const s = fixture(7),
    npc = venuePeople(s).find((n) => n.realmIndex < 7)!;
  assert.ok(npc);
  assert.ok(venueHostTopics(s, npc.id as never).length);
  const before = structuredClone(s);
  assert.ok(executeVenue(s, `host@${npc.id}@weapon`, venueStamp(s)));
  assert.equal(s.age, before.age + 1);
  assert.equal(s.stones, before.stones - 30);
  assert.equal(marketContact(s, npc.id)!.goodwill, 1);
  assert.equal(s.cultivation, before.cultivation);
  const goodwill = marketContact(s, npc.id)!.goodwill;
  rememberMarketTrade(s, npc.id);
  rememberMarketAid(s, npc.id);
  assert.equal(marketContact(s, npc.id)!.goodwill, goodwill, '同批讲法与交易不重复增加善意');
  assert.match(venueActionReason(s, `debate@${npc.id}`, venueStamp(s)), /再历/);
  const a = fixture(7);
  a.medicine.recipes = [];
  assert.ok(venueHostTopics(a, venuePeople(a)[0].id as never).every((t) => t.id === 'weapon'));
});
test('旧识求助需要真实往来，同批结果固定，核验或资助不发玩家丹药、重复和远程强行调停被拒绝', () => {
  assert.equal(venueFavor(fixture()), undefined);
  for (const method of ['check', 'pay', 'mediate']) {
    const s = reunion(7),
      offer = venueFavor(s)!;
    assert.deepEqual(venueFavor(s), offer);
    const before = structuredClone(s);
    assert.ok(executeVenue(s, `favor@${method}`, venueStamp(s)));
    assert.equal(s.age, before.age + 0.5);
    assert.deepEqual(s.medicine.bag, before.medicine.bag);
    assert.equal(s.stones, before.stones - (method === 'pay' ? offer.price : 0));
    assert.match(venueActionReason(s, 'favor@check', venueStamp(s)), /再过/);
    assert.deepEqual(importSave(exportSave(s, null)).save, sealSaveSnapshot(s));
  }
  const low = reunion(0);
  if (venueFavor(low)!.other.realmIndex > 0)
    assert.match(venueActionReason(low, 'favor@mediate', venueStamp(low)), /修为更高/);
});
test('寿元、天劫、供奉、未完历练、旧窗口和坏参数阻止结算，失败无部分扣款或记忆', () => {
  for (const change of [
    (s: ReturnType<typeof fixture>) => {
      s.cultivation = 1;
      s.age = 99;
    },
    (s: ReturnType<typeof fixture>) => {
      s.nextTribulationAge = s.age + 0.25;
    },
    (s: ReturnType<typeof fixture>) => {
      s.stones = 0;
      s.mortal.member = { id: 'taixuan', dueAt: s.mortal.years + 0.25, dues: 50 };
    },
  ]) {
    const s = fixture();
    change(s);
    const before = JSON.stringify(s);
    assert.equal(executeVenue(s, 'work', venueStamp(s)), undefined);
    assert.equal(JSON.stringify(s), before);
  }
  const s = fixture();
  for (const [choice, stamp, pending] of [
    ['work', venueStamp(s), true],
    ['work', '0:0:0', false],
    ['invalid', venueStamp(s), false],
    ['work@', venueStamp(s), false],
    ['favor@check@extra', venueStamp(s), false],
    [`seek@${venuePeople(s)[0].id}@extra`, venueStamp(s), false],
  ] as const) {
    const before = JSON.stringify(s);
    assert.equal(executeVenue(s, choice, stamp, pending), undefined);
    assert.equal(JSON.stringify(s), before);
  }
});
test('新增存档往返保留、旧档正常升级，损坏字段本机安全隔离、导入拒绝', () => {
  const s = fixture();
  executeVenue(s, 'work', venueStamp(s));
  assert.ok(validMarketVenues(s.mortal.marketVenues, s.age));
  assert.deepEqual(importSave(exportSave(s, null)).save, sealSaveSnapshot(s));
  const old = structuredClone(s);
  old.schema = SAVE_SCHEMA - 1;
  delete old.mortal.marketVenues;
  assert.equal(readSave(JSON.stringify(old)).save.schema, SAVE_SCHEMA);
  s.mortal.marketVenues!.workAt = s.age + 1;
  assert.equal(readSave(JSON.stringify(s)).save.mortal.marketVenues, undefined);
  assert.throws(() => importSave(exportSave(s, null)));
});
test('参与者的AI只知道本人的相助事实，没有别人争执的真伪或隐藏库存', () => {
  const s = fixture(7),
    n = venuePeople(s)[0];
  rememberMarketAid(s, n.id);
  const request = {
    population: s.mortal.population!,
    age: s.age,
    npcId: n.id,
    realm: '大乘初期',
    message: '记得上次吗',
    history: [],
    marketVisit: { visit: s.mortal.sectMarket!.visit, realmIndex: s.mortal.sectMarket!.realmIndex },
    marketContext: marketDialogueContext(s, n.id),
  };
  assert.ok(validDialogue(request));
  assert.match(dialogueMessages(request)[0].content, /实际相助或指点/);
  assert.equal(marketDialogueContext(s, venuePeople(s)[1].id).contact, null);
  request.marketContext.contact!.aidAt = s.age + 1;
  assert.equal(validDialogue(request), false);
});
test('真实办事控制器先写档后应用，保存失败、过期面板和重复点击没有部分收益，续局保留', () => {
  for (const fail of [true, false]) {
    const save = fixture(7);
    const npc = venuePeople(save).find((n) => n.realmIndex < 7)!;
    const choice = `host@${npc.id}@weapon`,
      run = new Game(save, 0, 0, () => 0.5);
    run.pause();
    const before = structuredClone(save);
    let stored: unknown,
      result = '';
    const host: any = {
      dataset: { venue: 'forum' },
      innerHTML: marketVenueContent(save, 'forum', true),
      querySelector: () => ({
        set textContent(v: string) {
          result = v;
        },
      }),
      querySelectorAll: () => [
        {
          dataset: { action: 'market-venue-act', id: choice, stamp: venueStamp(save) },
          disabled: false,
        },
      ],
    };
    const shell: any = {
      save,
      saveLock: null,
      inMarket: true,
      game: null,
      pendingRun: run,
      panel: 'market-venue',
      marketScene: { nearVenue: { id: 'forum' } },
      structuredClone,
      modal: {
        querySelector: (q: string) =>
          q === '#market-venue-content' ? host : q === '.panel' ? { scrollTop: 70 } : null,
      },
      document: { getElementById: () => null },
      toast: () => {},
      writeSave: (next: unknown, pending: unknown) => {
        assert.equal(pending, run);
        if (fail) throw Error('保存失败');
        stored = structuredClone(next);
      },
    };
    marketVenueAction(shell, 'market-venue-act', choice);
    if (fail) {
      assert.deepEqual(save, before);
      assert.equal(stored, undefined);
      assert.equal(result, '');
    } else {
      assert.ok(result);
      assert.deepEqual(stored, save);
      const after = structuredClone(save);
      marketVenueAction(shell, 'market-venue-act', choice);
      assert.deepEqual(save, after);
    }
  }
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
test('院落异步载入失败可重试，关窗、离场、换批、离开门前或存档锁定后不重开', async () => {
  for (const invalidate of [
    (s: any, host: any) => {
      host.isConnected = false;
    },
    (s: any) => {
      s.panel = '';
    },
    (s: any) => {
      s.inMarket = false;
    },
    (s: any) => {
      s.save.mortal.sectMarket.visit++;
    },
    (s: any) => {
      s.marketScene.nearVenue.id = 'office';
    },
    (s: any) => {
      s.saveLock = {};
    },
    () => {},
  ]) {
    let resolve!: (value: any) => void, reject!: (error: Error) => void;
    const button: any = {};
    const host = { isConnected: true, textContent: '', innerHTML: '', querySelector: () => button };
    let renders = 0,
      loads = 0;
    const shell: any = {
      save: fixture(),
      saveLock: null,
      inMarket: true,
      panel: '',
      marketScene: { nearVenue: { id: 'forum', name: '论道院' } },
      panelFrame: () => {},
      modal: { querySelector: () => host },
      marketEventSource: {
        load: () => {
          loads++;
          return new Promise((r, j) => {
            resolve = r;
            reject = j;
          });
        },
      },
    };
    showMarketVenue(shell, 'forum');
    reject(Error('断网'));
    await flush();
    assert.match(host.innerHTML, /重新展开/);
    button.onclick();
    assert.equal(loads, 2);
    invalidate(shell, host);
    const active =
      host.isConnected &&
      shell.panel === 'market-venue' &&
      shell.inMarket &&
      !shell.saveLock &&
      shell.marketScene.nearVenue.id === 'forum' &&
      shell.save.mortal.sectMarket.visit === 1;
    resolve({ renderVenue: () => renders++ });
    await flush();
    assert.equal(renders, active ? 1 : 0);
  }
});
test('坊市场景异步载入不在离场/换批后挂载，失败保留重试且不启动场景计龄', async () => {
  for (const invalidate of [
    (s: any, host: any) => {
      host.isConnected = false;
    },
    (s: any) => {
      s.inMarket = false;
    },
    (s: any) => {
      s.save.mortal.sectMarket.visit++;
    },
    (s: any) => {
      s.saveLock = {};
    },
    () => {},
  ]) {
    let resolve!: (value: any) => void,
      reject!: (error: Error) => void,
      mounts = 0;
    const host = { isConnected: true, innerHTML: '' };
    const shell: any = {
      save: fixture(),
      saveLock: null,
      inMarket: true,
      marketScene: null,
      marketPosition: { x: 1000, y: 790 },
      document: { getElementById: () => host },
      marketEventSource: {
        load: () =>
          new Promise((r, j) => {
            resolve = r;
            reject = j;
          }),
      },
    };
    mountTownScene(shell);
    reject(Error('断网'));
    await flush();
    assert.equal(shell.marketScene, null);
    assert.match(host.innerHTML, /重新加载/);
    mountTownScene(shell);
    invalidate(shell, host);
    const active =
      host.isConnected &&
      shell.inMarket &&
      !shell.saveLock &&
      shell.save.mortal.sectMarket.visit === 1;
    resolve({
      SectMarketScene: class {
        constructor() {
          mounts++;
        }
      },
    });
    await flush();
    assert.equal(mounts, active ? 1 : 0);
  }
});
