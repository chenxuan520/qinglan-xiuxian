import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ROOT_STARTERS, treasure } from '../src/data.ts';
import { freshSave } from '../src/progress.ts';
import { rootRevealBody } from '../src/opening-ui.ts';

function starterCards(html: string) {
  return [
    ...html.matchAll(
      /<div class="root-reveal-starter( is-current)?">[^]*?<strong>([^<]+)<\/strong><small>([^<]+)<\/small>/g,
    ),
  ].map((match) => ({ current: !!match[1], name: match[2], path: match[3] }));
}

for (const element of ELEMENTS) {
  for (const path of ['orthodox', 'demonic', 'dual'] as const) {
    test(`${element.name}灵根命盘同时展示正魔入门本命，只突出当前${path}本命且不改存档`, () => {
      const save = freshSave('heaven', [element.id], path);
      const before = structuredClone(save);
      const html = rootRevealBody(save);
      const [orthodoxId, demonicId] = ROOT_STARTERS[element.id];
      assert.deepEqual(starterCards(html), [
        {
          current: save.starter === orthodoxId,
          name: treasure(orthodoxId).name,
          path: '正道 / 兼修',
        },
        { current: save.starter === demonicId, name: treasure(demonicId).name, path: '魔道' },
      ]);
      assert.ok(html.includes(`本命法宝 · ${element.name}系`));
      assert.doesNotMatch(html, /undefined/);
      assert.deepEqual(save, before);
    });
  }
}

test('多灵根命盘按首位五行显示两件，而非按当前特殊本命的五行；两件均不突出', () => {
  const save = freshSave('triple', ['fire', 'wood', 'water'], 'orthodox');
  save.starter = 'umbrella';
  save.artifacts.push('umbrella');
  const before = structuredClone(save);
  const html = rootRevealBody(save);
  assert.deepEqual(starterCards(html), [
    { current: false, name: '九霄雷符', path: '正道 / 兼修' },
    { current: false, name: '离火珠', path: '魔道' },
  ]);
  assert.ok(html.includes('本命法宝 · 火系'));
  assert.doesNotMatch(html, /is-current|undefined/);
  assert.deepEqual(save, before);
});

test('无灵根仍用原单件结构显示实际本命及其五行，不添加双件或当前标记', () => {
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
      assert.doesNotMatch(html, /root-reveal-starters|is-current|正道 \/ 兼修|undefined/);
      assert.deepEqual(save, before);
    }
  }
});
