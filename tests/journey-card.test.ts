import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { JOURNEY_CARD_QR, JOURNEY_CARD_QR_COLORS, journeyCardData } from '../src/journey-card.ts';
import { GAME_SITE_URL } from '../src/setting.ts';
import { freshSave, enterImmortalGate } from '../src/progress.ts';
import { chooseHumanStory, humanStoryView } from '../src/human-stories.ts';
import { joinSect } from '../src/mortal.ts';

test('纪念卡只写当前资质与真实成果，不把年岁写成寿终或虚构未结道侣', () => {
  const save = freshSave('none', [], 'orthodox', () => 0);
  const before = JSON.stringify(save);
  const card = journeyCardData(save);
  assert.equal(card.realm, '炼气初期');
  assert.equal(card.age, '15');
  assert.equal(card.lifespan, '寿限 100 年');
  assert.equal(card.identity, '正道 · 散修');
  assert.equal(card.ending, 'ongoing');
  assert.equal(card.ended, false);
  assert.equal(card.root.name, '无灵根');
  assert.equal(card.root.seal, '废');
  assert.equal(card.root.elements.filter((element) => element.active).length, 0);
  assert.equal(card.weapon.name, '青霄剑');
  assert.equal(card.weapon.forge, 0);
  assert.ok(card.memories.length >= 1 && card.memories.length <= 4);
  assert.ok(!JSON.stringify(card).includes('道侣'));
  assert.ok(!JSON.stringify(card).includes('六仙同御'));
  assert.equal(JSON.stringify(save), before);
});

test('真仙与叩门状态分开，历史未知年岁不编造，六仙器只按已记录成就展示', () => {
  const save = freshSave();
  save.cultivation = 1e9;
  const ascendingCard = journeyCardData(save);
  assert.equal(ascendingCard.realm, '渡劫');
  assert.equal(ascendingCard.realmIndex, 7);
  assert.equal(ascendingCard.realmVerse, '雷叩仙关 · 生死一念');
  assert.equal(ascendingCard.ended, false);
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.age = 17421;
  assert.equal(journeyCardData(save).realm, '真仙');
  assert.equal(journeyCardData(save).realmIndex, 8);
  assert.equal(journeyCardData(save).realmVerse, '长生已证 · 犹念人间');
  assert.equal(journeyCardData(save).ended, false);
  save.chronicle.milestones['six-immortals'] = null;
  assert.ok(journeyCardData(save).memories.some((m) => m.title === '六仙同御'));
  assert.equal(enterImmortalGate(save), true);
  const card = journeyCardData(save);
  assert.equal(card.ended, true);
  assert.equal(card.ending, 'immortal');
  assert.equal(card.lifespan, '寿元无尽');
  assert.equal(card.age, '17,421');
  assert.ok(!JSON.stringify(card).includes('大乘后期'));
});

test('道侣与旧信来自真实缘簿，只写当前宗门，不猜测已经遗失的历史', () => {
  const save = freshSave();
  save.age = 20;
  save.stones = 1000;
  save.mortal.population = { seed: 12345, since: 15 };
  chooseHumanStory(save, 'companion', 'meet');
  save.age += 2;
  chooseHumanStory(save, 'companion', 'bond');
  joinSect(save, 'power');
  const before = JSON.stringify(save);
  const card = journeyCardData(save);
  assert.ok(card.identity.includes('太玄剑宗'));
  assert.equal(card.root.elements.filter((element) => element.active).length, 1);
  assert.equal(card.weapon.id, save.starter);
  assert.equal(card.memories[0].title, '人间有归灯');
  assert.ok(card.memories[0].detail.includes(humanStoryView(save, 'companion')!.name));
  assert.equal(JSON.stringify(save), before);
  save.mortal.member = null;
  assert.equal(journeyCardData(save).identity, '正道 · 散修');
  save.mortal.humanStories = {};
  chooseHumanStory(save, 'friend', 'meet');
  save.age = save.mortal.humanStories.friend!.endsAt;
  assert.equal(journeyCardData(save).memories[0].title, '旧信犹温');
  assert.ok(journeyCardData(save).memories[0].detail.includes('尚未展读'));
  chooseHumanStory(save, 'friend', 'read');
  assert.ok(journeyCardData(save).memories[0].detail.includes('已珍藏于此世'));
});

test('寿元耗尽后的留影标记此世寿终，尚未重置本世数据', () => {
  const save = freshSave();
  save.age = 100;
  save.stones = 321;
  const before = JSON.stringify(save);
  const card = journeyCardData(save);
  assert.equal(card.ending, 'lifespan');
  assert.equal(card.ended, false);
  assert.equal(card.age, '100');
  assert.equal(JSON.stringify(save), before);
});

test('天劫殒命留影标记止于天劫，保留待轮回的本世数据', () => {
  const save = freshSave();
  save.tribulations = 2;
  const before = JSON.stringify(save);
  const card = journeyCardData(save, 'tribulation');
  assert.equal(card.ending, 'tribulation');
  assert.equal(card.ended, false);
  assert.equal(JSON.stringify(save), before);
});

test('已达成成就优先于六仙同御和渡劫记录，留痕最多两行四条', () => {
  const save = freshSave();
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.tribulations = 1;
  save.chronicle.milestones.forge = 16;
  save.chronicle.milestones.collection = 20;
  save.chronicle.milestones['six-immortals'] = 30;
  save.chronicle.milestones['three-paths'] = 40;
  save.chronicle.milestones['hard-immortal'] = 50;
  assert.deepEqual(
    journeyCardData(save).memories.map((memory) => memory.title),
    ['逆境问道', '三道皆证', '万宝归藏', '炉火纯青'],
  );
});

test('纪念卡米金墨绿二维码保留浅色静区并能解码为官网，不携带玩家数据', () => {
  assert.deepEqual(JOURNEY_CARD_QR_COLORS, { light: '#e1d3a4', dark: '#102b28' });
  const { data, size } = JOURNEY_CARD_QR;
  const scale = 8;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const color = data[Math.floor(y / scale)][Math.floor(x / scale)]
        ? JOURNEY_CARD_QR_COLORS.dark
        : JOURNEY_CARD_QR_COLORS.light;
      const rgb = Number.parseInt(color.slice(1), 16);
      pixels[offset] = (rgb >> 16) & 255;
      pixels[offset + 1] = (rgb >> 8) & 255;
      pixels[offset + 2] = rgb & 255;
      pixels[offset + 3] = 255;
    }
  for (let i = 0; i < 4; i++) {
    assert.ok(data[i].every((cell) => !cell));
    assert.ok(data[size - 1 - i].every((cell) => !cell));
    assert.ok(data.every((row) => !row[i] && !row[size - 1 - i]));
  }
  assert.equal(jsQR(pixels, width, width)?.data, GAME_SITE_URL);
  assert.equal(new URL(GAME_SITE_URL).protocol, 'https:');
});
