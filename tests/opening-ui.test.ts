import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ROOT_STARTERS, treasure } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';
import { rootRevealBody } from '../src/opening-ui.ts';

// 双件结构是「名称在前、路线在后」；无灵根单件仍是「小标题在前、名称在后」，不会被这条匹配到。
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

test('无灵根仍用原单件结构显示实际本命及其五行，不添加双件或路线标记', () => {
  for (const ids of Object.values(ROOT_STARTERS)) {
    for (const id of ids) {
      const save = freshSave(
        'none',
        [],
        treasure(id).school === 'demonic' ? 'demonic' : 'orthodox',
      );
      save.starter = id;
      save.artifacts = [...ids];
      const before = structuredClone(save);
      const html = rootRevealBody(save);
      assert.equal([...html.matchAll(/class="root-reveal-starter"/g)].length, 1);
      assert.ok(html.includes(`<strong>${treasure(id).name}</strong>`));
      const element = ELEMENTS.find((e) => e.id === treasure(id).element)!;
      assert.ok(html.includes(`<small>本命法宝 · ${element.name}系</small>`));
      assert.doesNotMatch(html, /root-reveal-starters|is-current|正道|魔道|undefined/);
      assert.deepEqual(save, before);
    }
  }
});
