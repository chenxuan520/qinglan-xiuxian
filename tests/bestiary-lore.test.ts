import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_LORE } from '../src/bestiary-lore.ts';
import { bestiaryPanel } from '../src/bestiary-ui.ts';
import { FINAL_TRIAL_STAGE, STAGES } from '../src/data.ts';

// 与用户逐条确认的原文独立对照，防止字词、标点或段落次序被顺带修改。
const approved = [
  '竹海深处，根系沿灵脉蔓延了不知多少年，灵潮一涨，整片生机便在一处结成了王躯。它不坐在什么王座上，藤枝、荆棘与山灵都与它相连，像整座山林生出的一个念头。击破它，是第一次真正走通这段山路；竹海还会长，旧路也还会被灵潮重新唤醒。',
  '古墟原是几代修士经营的炉场：先有地火与炉，后有仓库、守卫与殿宇。维护的人走了，炉火却没有全熄，狐群顺着当年运货的火径住了下来，赤炎狐王便在余烬里长成。它的火圈与回焰走的都是旧阵路——古人修的路还在运转，只是不再为人服务。',
  '古修借谷中寒脉封存易散的药性与器纹，珍物在冰里一放就是千年。狼群在这条窄谷里世代猎食，霜魄狼王最懂得把扑击的节律与冰棱成形的时差凑到一处，让人的迟疑变成破绽。冰能留住器物，留不住走进谷里的人的年月。',
  '山地的腐殖、沉下的灵质、古修丢弃的残物，最后都流进了深泽，在这里被分解、重新混合。丹炉里的药母，落进泽水便成了毒；玄甲毒君以一身厚甲和自身的毒，承住了这片混杂的灵机。它并不想统治什么，只是这样活着，已足以致命。',
  '「冥府」只是修士给这片幽暗灵域起的名字。失主的器灵、旧仪式残留的命令、没有散去的情绪，在这里聚成魂火与形体。九幽冥主擅长维系与剪断联系，能让魂影沿你走过的路逆行。残响会学着故人的声音唤你，却从不回答。',
  '天境挨着高处的界隙，古修曾在此布下渡界与校准的阵枢。器物失了主，仍按旧节律运转；游离的灵性在雷流里凝出了形，太虚劫灵便是其中最盛的一团。这一境考的不只是力量，还有准确：先后落下的雷，要看清时机才躲得开。',
  '归墟是诸潮与道痕汇聚之处，前六境的道痕在这里凝成劫相，熟悉的招式会与新的危险同时出现。九天执劫仙尊是古老渡界法统留下的执劫法身，把散在各境的考验合成最后一问。它的原身与来历，至今无人说得清；胜过它，不是杀死天上的主宰，而是证明自己的道基经得起这一问。',
];

function bossCards(body: string) {
  return new Map(
    [
      ...body.matchAll(/<article class="enemy-card" data-boss-stage="(\d+)">([^]*?)<\/article>/g),
    ].map((match) => [Number(match[1]), match[2]]),
  );
}

function lore(card: string) {
  const match = card.match(/<p class="boss-lore" aria-label="妖王来历">([^]*?)<\/p>/);
  assert.ok(match, '每张妖王卡片应有独立来历段落');
  return match[1];
}

test('七段妖王来历逐字采用用户定稿，包括标点与原境次序', () => {
  assert.equal(BOSS_LORE.length, STAGES.length);
  assert.deepEqual(BOSS_LORE, approved);
});

test('未通关时各视图不泄露任何来历全文，只显示解锁提示', () => {
  for (const view of [-1, ...STAGES.map((_, index) => index)]) {
    const body = bestiaryPanel(view).body;
    const cards = bossCards(body);
    assert.equal(cards.size, view < 0 || view === FINAL_TRIAL_STAGE ? STAGES.length : 1);
    for (const card of cards.values()) assert.equal(lore(card), '击败后可见来历');
    for (const text of approved) assert.ok(!body.includes(text));
  }
});

test('通关只解锁对应原境妖王，全文位于卡片现有数值之后', () => {
  for (const difficulty of [0, 1, 2]) {
    for (let completedStage = 0; completedStage < STAGES.length; completedStage++) {
      const cards = bossCards(
        bestiaryPanel(-1, difficulty, [completedStage], {
          enemies: [],
          bosses: STAGES.map((_, id) => id),
        }).body,
      );
      for (const [stage, card] of cards) {
        assert.ok(card.includes(`<h3>${STAGES[stage].boss}</h3>`));
        assert.equal(lore(card), stage === completedStage ? approved[stage] : '击败后可见来历');
        assert.ok(
          card.indexOf('<small class="enemy-stats">') < card.indexOf('<p class="boss-lore"'),
        );
      }
      assert.equal(
        lore(
          bossCards(bestiaryPanel(completedStage, difficulty, [completedStage]).body).get(
            completedStage,
          )!,
        ),
        approved[completedStage],
      );
    }
  }
});

test('终关劫相沿用各自原境来历和解锁条件，仙尊只按第七境通关解锁', () => {
  for (const completed of [[], [1, 4], [FINAL_TRIAL_STAGE], [0, 1, 2, 3, 4, 5, 6]]) {
    const cards = bossCards(bestiaryPanel(FINAL_TRIAL_STAGE, 0, completed).body);
    assert.equal(cards.size, STAGES.length);
    for (const [stage, card] of cards) {
      assert.equal(lore(card), completed.includes(stage) ? approved[stage] : '击败后可见来历');
      for (const [other, text] of approved.entries())
        if (other !== stage) assert.ok(!card.includes(text), '劫相卡片不得混入其他妖王来历');
    }
  }
});

test('切换难度和视图只读通关列表，不改动玩家进度', () => {
  const completed = Object.freeze([0, 3, 6]);
  const before = JSON.stringify(completed);
  for (const view of [-1, 0, 3, FINAL_TRIAL_STAGE])
    for (const difficulty of [0, 1, 2]) bestiaryPanel(view, difficulty, completed);
  assert.equal(JSON.stringify(completed), before);
});
