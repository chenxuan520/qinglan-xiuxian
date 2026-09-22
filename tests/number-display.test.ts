import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { freshSave } from '../src/progress.ts';
import { chronicleContent, chronicleEntrance } from '../src/chronicle-ui.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { mortalPage, townStatus } from '../src/mortal-ui.ts';
import { TREASURES } from '../src/data.ts';

test('人间灵石、灵威与履历年岁不加千分位，保留各处小数精度且不改存档', () => {
  const save = freshSave();
  save.stones = 18421;
  save.age = 17421.26;
  save.cultivation = 1e9;
  save.chronicle.entries[0].age = save.age;
  save.chronicle.milestones.forge = save.age;
  const before = JSON.stringify(save);
  const score = spiritPower(save).score;
  assert.ok(score >= 1000);
  assert.match(townStatus(save), /灵石 18421 ·/);
  assert.match(townStatus(save), /年岁 17421\.26 /);
  assert.match(mortalPage(save, 'town', 'all'), /灵石 18421 ·/);
  assert.ok(chronicleEntrance(save).includes(`灵威 ${score} ·`));
  const chronicle = chronicleContent(save);
  assert.ok(chronicle.includes(`<strong>${score}</strong>`));
  assert.match(chronicle, /<small>17421\.3 岁<\/small>/);
  assert.match(chronicle, /<time>17421\.3 岁<\/time>/);
  assert.equal(JSON.stringify(save), before);
});

test('通关页保留万、亿和万亿缩写及一位小数，完整数值提示不加千分位', () => {
  // 单独执行原有纯模板函数，不启动 main 的 DOM、音频与存档流程。
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const render = source.match(/function completedJourney\([^]*?\n\}/)![0];
  for (const [value, expected] of [
    [9999, '9999'],
    [18421, '1.8万'],
    [184210000, '1.8亿'],
    [184210000000, '1842.1亿'],
    [1842100000000, '1.8万亿'],
  ] as const) {
    const save = freshSave();
    save.cultivation = save.age = value;
    const before = JSON.stringify(save);
    const html = runInNewContext(
      `${stripTypeScriptTypes(render)}; completedJourney('真仙', true, '')`,
      { save, TREASURES, smallIcon: () => '', spriteStyle: () => '' },
    );
    assert.ok(html.includes(`<strong title="${value}">${expected}</strong>`));
    assert.ok(html.includes(`<strong>${expected}<em>年</em></strong>`));
    assert.equal(JSON.stringify(save), before);
  }
});
