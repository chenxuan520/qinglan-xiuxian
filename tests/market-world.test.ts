import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, readSave, realmInfo, type SaveData } from '../src/progress.ts';
import { beginSectMarketVisit } from '../src/sect-market.ts';
import { marketContact, rememberMarketTrade } from '../src/market-relations.ts';
import { marketFriendLead, marketWorldEcho } from '../src/market-world.ts';
import {
  chooseMarketOpportunity,
  marketOpportunity,
  marketRequest,
  fulfillMarketRequest,
  settleMarketAmbush,
} from '../src/market-social.ts';
import { marketCultivators, MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import { marketDialogueContext } from '../src/npc-chat.ts';
import {
  marketDialogueLocalReply,
  marketDialogueMemory,
  type NpcDialogueRequest,
} from '../src/npc-dialogue.ts';
import { dialogueMessages, guardDialogueReply, validDialogue } from '../workers/npc-ai/index.ts';

function saveAt(seed = 12345) {
  const save = freshSave('heaven', ['metal'], 'orthodox', () => 0);
  save.cultivation = 10000;
  save.age = 30;
  save.stones = 10000;
  save.mortal.population = { seed, since: 15 };
  beginSectMarketVisit(save);
  return save;
}
function friendFixture() {
  for (let seed = 1; seed < 500; seed++) {
    const save = saveAt(seed);
    rememberMarketTrade(save, 'market-alchemist');
    beginSectMarketVisit(save);
    beginSectMarketVisit(save);
    const id = save.mortal.sectMarket!.returning![0].slot;
    rememberMarketTrade(save, id);
    const lead = marketFriendLead(save, id);
    if (lead) return { save, id, lead };
  }
  throw Error('缺少熟人介绍求购的固定样本');
}
function input(save: SaveData, npcId: NpcDialogueRequest['npcId'], message: string) {
  const state = save.mortal.sectMarket!;
  return {
    population: save.mortal.population!,
    age: save.age,
    realm: realmInfo(save.cultivation).name,
    npcId,
    marketVisit: {
      visit: state.visit,
      realmIndex: state.realmIndex,
      ...(state.returning ? { returning: state.returning } : {}),
      ...(state.absent ? { absent: state.absent } : {}),
    },
    marketContext: marketDialogueContext(save, npcId),
    message,
    history: [],
  } satisfies NpcDialogueRequest;
}

test('坊间回响只由已经保存的本人经历形成，读取与刷新不产生事件', () => {
  const save = saveAt();
  assert.equal(marketWorldEcho(save), undefined);
  save.mortal.marketSocial!.logs.push({
    visit: 1,
    npcId: 'market-alchemist',
    at: 30,
    kind: 'fraud',
    text: '不应拼接进旁白的任意旧日志',
  });
  const before = JSON.stringify(save);
  const echo = marketWorldEcho(save)!;
  assert.equal(echo.kind, 'fraud');
  assert.match(echo.text, /你想起上回付出的灵石/);
  assert.doesNotMatch(echo.text, /任意旧日志|传闻|人人|听说/);
  assert.equal(JSON.stringify(save), before);
  assert.deepEqual(marketWorldEcho(readSave(before).save), echo);
  beginSectMarketVisit(save);
  assert.deepEqual(marketWorldEcho(save), echo);
  save.pendingReincarnation = 'ambush';
  assert.equal(marketWorldEcho(save), undefined);
});

test('核验日志包含真货与骗局时都不把“已核验”误称为“已揭穿”', () => {
  for (const honest of [true, false]) {
    let checked = false;
    for (let seed = 1; seed < 300 && !checked; seed++) {
      const save = saveAt(seed);
      const id = MARKET_CULTIVATORS.find((npc) => {
        const offer = marketOpportunity(save, npc.id);
        return offer?.kind === 'goods' && offer.honest === honest;
      })?.id;
      if (!id) continue;
      assert.ok(chooseMarketOpportunity(save, id, 1, 'inspect'));
      const echo = marketWorldEcho(save)!;
      assert.equal(echo.kind, 'exposed');
      assert.match(echo.text, /亲手核过/);
      assert.doesNotMatch(echo.text, /揭穿|骗局|假药|人人|街上都知道/);
      checked = true;
    }
    assert.equal(checked, true);
  }
});

test('劫修结局回响来自实际结算：战斗中不讲结果，胜利与逃脱各有记忆', () => {
  for (const outcome of ['victory', 'escaped'] as const) {
    let settled = false;
    for (let seed = 1; seed < 300 && !settled; seed++) {
      const save = saveAt(seed);
      const id = MARKET_CULTIVATORS.find((npc) => {
        const offer = marketOpportunity(save, npc.id);
        return offer?.kind === 'invitation' && !offer.honest;
      })?.id;
      if (!id) continue;
      assert.ok(chooseMarketOpportunity(save, id, 1, 'accept'));
      assert.equal(marketWorldEcho(save), undefined);
      const snapshot = save.mortal.marketSocial!.ambush!.snapshot;
      snapshot.outcome = outcome;
      if (outcome === 'victory') snapshot.enemy.hp = 0;
      else {
        snapshot.time = 3;
        snapshot.retreatRequested = true;
        snapshot.retreatProgress = 2;
        snapshot.player.x = 28;
        snapshot.enemy.x = 470;
      }
      assert.ok(settleMarketAmbush(save, outcome));
      const echo = marketWorldEcho(save)!;
      assert.equal(echo.kind, outcome);
      assert.match(echo.text, outcome === 'victory' ? /旁人未必知晓/ : /挣出的退路/);
      assert.deepEqual(marketWorldEcho(readSave(JSON.stringify(save)).save), echo);
      const stranger = MARKET_CULTIVATORS.find((npc) => npc.id !== id)!.id;
      const context = marketDialogueContext(save, stranger);
      assert.ok(!context.events.includes(outcome));
      assert.ok(!context.events.includes('ambush'));
      settled = true;
    }
    assert.equal(settled, true);
  }
});

test('故交只介绍当前其他真人尚未交付的求购，报价和炼器等级与真实需求相符', () => {
  const { save, id, lead } = friendFixture();
  const before = JSON.stringify(save);
  const request = marketRequest(save, lead.npcId)!;
  const target = marketCultivators(save.mortal.population!, save.mortal.sectMarket!).find(
    (npc) => npc.id === lead.npcId,
  )!;
  assert.notEqual(lead.npcId, id);
  assert.equal(lead.name, target.name);
  for (const field of ['kind', 'id', 'quantity', 'forgeLevel', 'minimumLevel', 'price'] as const)
    assert.equal(lead[field], request[field]);
  assert.equal(marketFriendLead(save, id)!.text, lead.text);
  assert.equal(JSON.stringify(save), before);
  assert.deepEqual(marketFriendLead(readSave(before).save, id), lead);
  if (request.kind === 'medicine') save.medicine.bag[request.id] = request.quantity;
  else {
    save.artifacts.push(request.id);
    save.forge[request.id] = request.forgeLevel;
  }
  assert.ok(
    fulfillMarketRequest(save, lead.npcId, save.mortal.sectMarket!.visit, request.forgeLevel),
  );
  assert.equal(marketFriendLead(save, id), undefined);
  assert.equal(marketDialogueContext(save, id).trade!.lead, null);
  const after = input(save, id, '上次你说的那位还收吗？');
  after.history = [{ role: 'assistant', content: `你可去找${lead.name}，他正求购这份物品。` }];
  assert.match(marketDialogueLocalReply(after), /眼下没有.*旧消息未必还作数/);
  const guarded = guardDialogueReply(after, `${lead.name}仍在求购，赶紧把东西送过去。`);
  assert.match(guarded, /眼下没有/);
  assert.doesNotMatch(guarded, new RegExp(lead.name));
});

test('初见、交恶、死者与离场者都不能提供故交指路，换批不沿用过期供需', () => {
  for (const scenario of ['stranger', 'grudge', 'dead', 'absent', 'target-absent', 'new-visit']) {
    const { save, id, lead } = friendFixture();
    const contact = marketContact(save, id)!;
    if (scenario === 'stranger') contact.goodwill = 1;
    if (scenario === 'grudge') contact.grudge = 1;
    if (scenario === 'dead') contact.dead = true;
    if (scenario === 'absent') save.mortal.sectMarket!.absent = [id];
    if (scenario === 'target-absent') save.mortal.sectMarket!.absent = [lead.npcId];
    if (scenario === 'new-visit') beginSectMarketVisit(save);
    assert.equal(marketFriendLead(save, id), undefined, scenario);
  }
});

test('AI与离线对白说出真实用途与当前求购，不发送隐藏真假、私人物资或任意日志', () => {
  const { save, id, lead } = friendFixture();
  save.medicine.bag.huiyang = 987654;
  const request = input(save, id, '我有余物，谁在求购？');
  assert.equal(validDialogue(request), true);
  const json = JSON.stringify(request);
  assert.doesNotMatch(json, /987654|opportunityHonest|"honest"|"bag"|"text"/);
  const local = marketDialogueLocalReply(request);
  assert.match(local, new RegExp(lead.name));
  assert.match(local, new RegExp(`${lead.price}灵石`));
  const prompt = dialogueMessages(request)[0].content;
  assert.match(prompt, /当前仍有效的指引/);
  assert.match(prompt, /当事人自述|你自己说/);
  assert.match(prompt, /不自行添设证人、报复或结算/);
  assert.match(marketDialogueLocalReply({ ...request, message: '你为什么来备药？' }), /正寻/);
  const invalid = [
    { ...request.marketContext!.trade!, friend: false },
    { ...request.marketContext!.trade!, motive: '立刻成仙' },
    { ...request.marketContext!.trade!, wantedMedicineIds: ['not-a-medicine'] },
    { ...request.marketContext!.trade!, wantedWeaponIds: ['not-a-treasure'] },
    {
      ...request.marketContext!.trade!,
      lead: { ...request.marketContext!.trade!.lead!, npcId: id },
    },
    {
      ...request.marketContext!.trade!,
      lead: { ...request.marketContext!.trade!.lead!, price: -1 },
    },
    {
      ...request.marketContext!.trade!,
      lead: { ...request.marketContext!.trade!.lead!, name: '任意姓名' },
    },
  ];
  for (const trade of invalid)
    assert.equal(
      validDialogue({ ...request, marketContext: { ...request.marketContext!, trade } }),
      false,
    );
});

test('无关修士不会把私人胜负说成全坊传闻，已完成求购也不沿用旧聊天的介绍', () => {
  const { save, id } = friendFixture();
  const request = input(save, id, '近来可有什么见闻？');
  for (const reply of [
    '听说你杀了那名劫修，整个坊市都在说。',
    '全坊都知道你从那场伏击逃回来了。',
    '你杀劫修的事如今人人都知道。',
  ]) {
    const result = guardDialogueReply(request, reply);
    assert.match(result, /未曾亲见/);
    assert.doesNotMatch(result, /你杀|整个坊市|全坊都知道/);
  }
  request.marketContext!.trade!.lead = null;
  assert.match(marketDialogueMemory(request), /不沿用聊天历史里的旧求购/);
});
