import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';
import { journeyMap } from '../src/journey-map.ts';
import { freshHometown } from '../src/hometown.ts';

const node = (html: string, name: string) => {
  const result = [...html.matchAll(/<button\b[^]*?<\/button>/g)].find(([button]) =>
    button.includes(`<strong>${name}</strong>`),
  );
  assert.ok(result, `地图缺少 ${name}`);
  return result[0];
};

test('初入仙途可归乡、挑战竹海，后六境与仙门不可越级进入', () => {
  const save = freshSave();
  const before = JSON.stringify(save);
  const html = journeyMap(save, 0);
  assert.doesNotMatch(node(html, '青岚镇'), /disabled/);
  assert.match(node(html, STAGES[0].name), /aria-pressed="true"/);
  assert.doesNotMatch(node(html, STAGES[0].name), /disabled/);
  for (const stage of STAGES.slice(1)) assert.match(node(html, stage.name), /disabled/);
  assert.match(node(html, '仙门'), /disabled/);
  assert.equal(JSON.stringify(save), before, '查看地图不能改变年岁或存档');
});

test('通关、可挑战与当前选择独立，已通关的秘境仍可重游', () => {
  const save = freshSave();
  save.unlocked = 3;
  save.completed = [0, 1, 2];
  const html = journeyMap(save, 1);
  assert.match(node(html, STAGES[1].name), /aria-pressed="true"/);
  assert.match(node(html, STAGES[1].name), /已通关/);
  assert.doesNotMatch(node(html, STAGES[3].name), /disabled/);
  assert.match(node(html, STAGES[3].name), /可挑战/);
  assert.match(node(html, STAGES[4].name), /disabled/);
});

test('修为或七境单独达标均不能叩门，真仙节点沿用终章确认入口', () => {
  const save = freshSave();
  save.cultivation = 1e9;
  assert.match(node(journeyMap(save, 0), '仙门'), /disabled/);
  save.cultivation = 0;
  save.unlocked = 6;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  assert.match(node(journeyMap(save, 6), '仙门'), /disabled/);
  save.cultivation = 1e9;
  const gate = node(journeyMap(save, 6), '仙门');
  assert.doesNotMatch(gate, /disabled/);
  assert.match(gate, /data-action="immortal-gate"/);
  assert.match(node(journeyMap(save, 6), '青岚镇'), /来处/);
});

test('未归乡发现的父母家书不会提前提示，发现后未读才显示来信', () => {
  const save = freshSave();
  save.age = 200;
  save.mortal.hometown = freshHometown(() => 0);
  save.mortal.hometown.stage = 'departed';
  assert.doesNotMatch(node(journeyMap(save, 0), '青岚镇'), /来信|父亲|母亲|离世/);
  save.mortal.hometown.letterFoundAt = save.age;
  assert.match(node(journeyMap(save, 0), '青岚镇'), /有故人来信/);
  save.mortal.hometown.letterRead = true;
  assert.doesNotMatch(node(journeyMap(save, 0), '青岚镇'), /来信/);
});
