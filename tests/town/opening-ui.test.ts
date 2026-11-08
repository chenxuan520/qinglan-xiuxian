import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ROOT_STARTERS, treasure } from '../../src/core/data.ts';
import { freshSave } from '../../src/core/progress.ts';
import { rootRevealBody } from '../../src/town/opening-ui.ts';

function pairedCards(html: string) {
  return [
    ...html.matchAll(
      /<div class="root-reveal-starter">[^]*?<strong>([^<]+)<\/strong><small>([^<]+)<\/small>/g,
    ),
  ].map((match) => ({ name: match[1], path: match[2] }));
}

for (const element of ELEMENTS) {
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    test(`${element.name}灵根命盘并列展示正魔入门本命，不区分当前${path}本命且不改存档`, () => {
      const save = freshSave('heaven', [element.id], path);
      const before = structuredClone(save);
      const html = rootRevealBody(save);
      const [orthodoxId, demonicId] = ROOT_STARTERS[element.id];
      assert.deepEqual(pairedCards(html), [
        { name: treasure(orthodoxId).name, path: '正道' },
        { name: treasure(demonicId).name, path: '魔道' },
      ]);
      assert.ok(html.includes(`本命法宝 · ${element.name}系`));
      assert.doesNotMatch(html, /is-current|兼修|undefined/);
      assert.deepEqual(save, before);
    });
  }
}

test('无论存档携带哪一件、走哪条路线，命盘都不给任一件高亮', () => {
  for (const ids of Object.values(ROOT_STARTERS)) {
    for (const id of ids) {
      for (const path of ['orthodox', 'demonic', 'dual'] as const) {
        const save = freshSave('heaven', [treasure(id).element], path);
        save.starter = id;
        const html = rootRevealBody(save);
        assert.equal(pairedCards(html).length, 2);
        assert.doesNotMatch(html, /is-current/);
      }
    }
  }
});

test('多灵根命盘按首位五行显示两件，而非按当前特殊本命的五行', () => {
  const save = freshSave('triple', ['fire', 'wood', 'water'], 'orthodox');
  save.starter = 'umbrella';
  save.artifacts.push('umbrella');
  const before = structuredClone(save);
  const html = rootRevealBody(save);
  assert.deepEqual(pairedCards(html), [
    { name: '九霄雷符', path: '正道' },
    { name: '离火珠', path: '魔道' },
  ]);
  assert.ok(html.includes('本命法宝 · 火系'));
  assert.doesNotMatch(html, /is-current|undefined/);
  assert.deepEqual(save, before);
});

test('无灵根按随机本命所属五行展示实际赠送的正魔两件，三条路线均不改存档', () => {
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    const pairs = Object.values(ROOT_STARTERS);
    const candidates =
      path === 'dual' ? pairs.flat() : pairs.map((pair) => pair[path === 'demonic' ? 1 : 0]);
    for (const [index, id] of candidates.entries()) {
      const save = freshSave('none', [], path, () => (index + 0.25) / candidates.length);
      assert.equal(save.starter, id);
      const [orthodoxId, demonicId] = ROOT_STARTERS[treasure(id).element];
      assert.deepEqual(save.artifacts, [orthodoxId, demonicId]);
      const before = structuredClone(save);
      const html = rootRevealBody(save);
      assert.deepEqual(pairedCards(html), [
        { name: treasure(orthodoxId).name, path: '正道' },
        { name: treasure(demonicId).name, path: '魔道' },
      ]);
      assert.equal([...html.matchAll(/class="root-reveal-starter"/g)].length, 2);
      const element = ELEMENTS.find((e) => e.id === treasure(id).element)!;
      assert.ok(
        html.includes(
          `<small class="root-reveal-starters-title">本命法宝 · ${element.name}系</small>`,
        ),
      );
      assert.ok(html.includes('<h3>无灵根</h3>'));
      assert.doesNotMatch(html, /is-current|undefined/);
      assert.deepEqual(save.rootElements, []);
      assert.deepEqual(save, before);
    }
  }
});
