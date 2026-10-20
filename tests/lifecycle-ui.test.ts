import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, IMMORTAL_CULTIVATION } from '../src/progress.ts';
import { grantCurio } from '../src/curio-data.ts';
import { Game } from '../src/game.ts';
import { treasure, type WeaponKind } from '../src/data.ts';
import { importConfirmPanel, pausePanel, restartRunPanel } from '../src/lobby-ui.ts';
import { epilogueReincarnatePanel, tribulationForfeitPanel } from '../src/opening-ui.ts';
import { hometownContent, npcDialogueContent } from '../src/mortal-ui.ts';

test('导入摘要只统计实际持有奇物，不把已售或未持有的唯一记录算作珍藏', () => {
  const save = freshSave();
  const before = JSON.stringify(save);
  assert.match(importConfirmPanel({ save, run: null })[2], /奇物珍藏 0 件/);
  assert.equal(JSON.stringify(save), before);
  grantCurio(save, 'soul-wood');
  grantCurio(save, 'jade-book');
  save.curios.bag['soul-wood'] = 0;
  assert.equal(save.curios.acquired.length, 2);
  assert.match(importConfirmPanel({ save, run: null })[2], /奇物珍藏 1 件/);
  delete save.curios.bag['jade-book'];
  assert.match(importConfirmPanel({ save, run: null })[2], /奇物珍藏 0 件/);
});

test('暂停搭配保留每件完整名称与重数，将名称和五行徽标分开布局', () => {
  const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
  const game = new Game(save, 0, 0, () => 0.5);
  const ids: WeaponKind[] = ['sword', 'pagoda', 'talisman', 'compass', 'coffin', 'cauldron'];
  for (const length of [1, 6]) {
    game.weapons = ids.slice(0, length).map((id, index) => ({
      id,
      level: 6,
      evolved: index % 2 === 0,
      timer: 0,
    }));
    const before = JSON.stringify(game.snapshot());
    const html = pausePanel(game, save, 60, false)[2];
    assert.equal((html.match(/class="pause-weapon-name"/g) ?? []).length, length);
    for (const weapon of game.weapons) {
      const name = weapon.evolved ? treasure(weapon.id).evolution : treasure(weapon.id).name;
      assert.ok(
        html.includes(
          `<span class="pause-weapon-name">${name} · 6重</span><span class="element-affinity`,
        ),
      );
    }
    assert.equal(JSON.stringify(game.snapshot()), before);
  }
});

test('另启历练在确认前分别说明未结奖励与已入库永久进度', () => {
  const html = restartRunPanel()[2];
  assert.match(html, /尚未结算的灵石、玄铁与通关奖励将不再领取/);
  assert.match(html, /已经入库的永久修为、物资、收藏与炼器进度保留/);
  assert.match(html, /data-action="restore"/);
  assert.match(html, /data-action="new-run"/);
});

test('天劫暂停与弃劫确认说明先落幕留影，再由玩家确认轮回', () => {
  const save = freshSave();
  const game = new Game(save, 0, 0, () => 0.5);
  game.tribulation = 1;
  const pause = pausePanel(game, save, 60, false)[2];
  assert.match(pause, /放弃后此世落幕，可先留存此世，再确认轮回/);
  assert.match(pause, /data-action="abandon"[^>]*>放弃渡劫<\/button>/);
  const confirmation = tribulationForfeitPanel(game);
  assert.equal(confirmation[0], '放弃渡劫');
  assert.match(confirmation[2], /确认放弃后可先留存此世，再决定轮回/);
  assert.doesNotMatch(pause + confirmation.join(''), /强制轮回|弃劫即轮回/);
});

test('传承选择后先说明不可带走的进度并确认，赞赏不隔开核心操作', () => {
  const save = freshSave();
  save.cultivation = IMMORTAL_CULTIVATION;
  save.completed = [6];
  const before = JSON.stringify(save);
  const html = epilogueReincarnatePanel(save)[2];
  const preview = html.indexOf('inheritance-preview');
  const consequence = html.indexOf('除所选赠物外');
  const confirm = html.indexOf('data-action="confirm-reincarnate"');
  const support = html.indexOf('reincarnate-support');
  assert.ok(preview >= 0 && preview < consequence && consequence < confirm && confirm < support);
  assert.equal((html.match(/data-action="confirm-reincarnate"/g) ?? []).length, 1);
  assert.match(html, /data-action="close">留在终章/);
  assert.equal(JSON.stringify(save), before);
});

test('家中正文保留叮嘱，初始聊天只去掉同句占位，普通镇民仍保留开场', () => {
  const save = freshSave();
  save.mortal.hometown!.stage = 'departed';
  const html = hometownContent(save, 'mother');
  assert.match(html, /<p>路远，记得添衣。<\/p><\/blockquote>/);
  assert.match(html, /data-story-greeting="路远，记得添衣。"/);
  assert.match(html, /class="npc-chat-log"[^>]* hidden><\/div>/);
  const town = npcDialogueContent('herbs', '药铺先生');
  assert.doesNotMatch(town, /data-story-greeting|aria-live="polite" hidden/);
  assert.match(town, /class="npc-chat-log"[^>]*><p>[^<]+<\/p>/);
});
