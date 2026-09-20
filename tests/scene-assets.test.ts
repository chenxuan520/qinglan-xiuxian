import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneAssets } from '../src/scene-assets.ts';
import { STAGES, STAGE_ENEMIES, ENEMIES } from '../src/data.ts';
import { spriteFrame } from '../src/sprites.ts';

test('每境预加载本地图、全部本境敌人及首领，终境覆盖七王与召唤兵种', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const urls = sceneAssets(stage);
    assert.ok(urls.includes(STAGES[stage].terrain));
    assert.ok(urls.includes(spriteFrame(0).url));
    for (const type of STAGE_ENEMIES[stage])
      assert.ok(urls.includes(spriteFrame(ENEMIES[type].sprite).url));
    for (const boss of stage === 6 ? STAGES : [STAGES[stage]])
      assert.ok(urls.includes(spriteFrame(boss.sprite).url));
    assert.equal(urls.length, new Set(urls).size);
  }
  const first = sceneAssets(0);
  assert.equal(first.filter((url) => url.includes('terrain')).length, 1);
  assert.ok(!first.some((url) => /sects|town|enemies-heaven|boss-immortal/.test(url)));
  assert.ok(
    first.reduce((total, url) => total + readFileSync(`public${url}`).length, 0) < 3_000_000,
  );
});
test('旧续局额外妖物补载；天劫只加载对应首领、角色与终境地图', () => {
  assert.ok(sceneAssets(0, false, [81]).includes(spriteFrame(81).url));
  const urls = sceneAssets(0, true);
  assert.ok(urls.includes(STAGES[6].terrain));
  assert.ok(urls.includes(spriteFrame(81).url));
  assert.ok(!urls.includes(STAGES[0].terrain));
});
test('城镇与九职业NPC、正魔宗门图集均为有效压缩资源', () => {
  for (const name of [
    'town-ground',
    'town-buildings',
    'town-props',
    'town-npcs',
    'sects-orthodox',
    'sects-demonic',
  ]) {
    const image = readFileSync(`public/assets/${name}.webp`);
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    assert.equal(image.readUInt32LE(4) + 8, image.length);
    assert.ok(image.length < 1_000_000);
  }
});
