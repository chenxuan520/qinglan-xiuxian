import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { freshSave, realmCost, realmInfo } from '../src/progress.ts';
import { chronicleContent, chronicleEntrance } from '../src/chronicle-ui.ts';
import { spiritPower } from '../src/spirit-power.ts';
import { mortalPage, townStatus } from '../src/mortal-ui.ts';
import { FINAL_TRIAL_STAGE, TREASURES, treasure, passive } from '../src/data.ts';
import { Game } from '../src/game.ts';
import { formatNumber } from '../src/number-format.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('共享数字格式保留小整数，万、亿、万亿最多一位小数且不加分隔符', () => {
  for (const [value, expected] of [
    [0, '0'],
    [1000, '1000'],
    [9999, '9999'],
    [10000, '1万'],
    [10001, '1万'],
    [18421, '1.8万'],
    [99999999, '1亿'],
    [100000000, '1亿'],
    [184210000, '1.8亿'],
    [184210000000, '1842.1亿'],
    [1000000000000, '1万亿'],
    [1842100000000, '1.8万亿'],
  ] as const) {
    assert.equal(formatNumber(value), expected);
  }
});

test('履历灵威、气血与伤害简写，人间灵石与履历年岁精度不变且不改存档', () => {
  const save = freshSave();
  save.stones = 18421;
  save.age = 17421.26;
  save.cultivation = 1e9;
  save.chronicle.entries[0].age = save.age;
  save.chronicle.milestones.forge = save.age;
  const before = JSON.stringify(save);
  const power = spiritPower(save);
  assert.ok(power.score >= 10000);
  assert.match(townStatus(save), /灵石 18421 ·/);
  assert.match(townStatus(save), /年岁 17421\.26 /);
  assert.match(mortalPage(save, 'town', 'all'), /灵石 18421 ·/);
  assert.ok(chronicleEntrance(save).includes(`灵威 ${formatNumber(power.score)} ·`));
  const chronicle = chronicleContent(save);
  assert.ok(chronicle.includes(`<strong>${formatNumber(power.score)}</strong>`));
  assert.ok(chronicle.includes(`<span>气血 ${formatNumber(power.hp)}</span>`));
  assert.ok(
    chronicle.includes(
      `<span>本命基础伤害约 ${formatNumber(Math.round(power.weaponDamage))}</span>`,
    ),
  );
  assert.match(chronicle, /<small>17421\.3 岁<\/small>/);
  assert.match(chronicle, /<time>17421\.3 岁<\/time>/);
  assert.equal(JSON.stringify(save), before);
});

test('伤害飘字沿用向上取整和暴击感叹号，实际扣血及快照伤害仍为原数值', () => {
  for (const [damage, expected] of [
    [12.25, '13'],
    [9999, '9999'],
    [9999.25, '1万'],
    [10000, '1万'],
    [18421.25, '1.8万'],
    [184210000.25, '1.8亿'],
    [1842100000000.25, '1.8万亿'],
  ] as const) {
    for (const crit of [false, true]) {
      for (const health of [damage * 2, damage / 2]) {
        const game = new Game(freshSave(), 0, 0, () => 0.5);
        const enemy = game.spawnEnemy(0, false, false, { x: 100, y: 0 });
        enemy.hp = enemy.maxHp = health;
        const player = { ...game.player };
        game.hitEnemy(enemy, damage, crit, 'sword');
        const floating = game.effects.find((effect) => effect.kind === 'text')!;
        assert.equal(floating.text, `${expected}${crit ? '!' : ''}`);
        assert.equal(floating.color, crit ? '#f8db88' : '#e5edce');
        assert.equal(enemy.hp, health - damage);
        assert.equal(enemy.maxHp, health);
        assert.equal(game.damageDealt, Math.min(health, damage));
        assert.equal(game.damageBySource.sword, Math.min(health, damage));
        assert.deepEqual(game.player, player);
        const snapshot = JSON.parse(JSON.stringify(game.snapshot()));
        assert.equal(snapshot.damageDealt, game.damageDealt);
        assert.deepEqual(snapshot.damageBySource, game.damageBySource);
      }
    }
  }
});

test('HUD 仅缩写气血文字，保留当前气血向上取整与真实血条比例', () => {
  const render = source.match(/  set\(\s*'health-text'[^]*?(?=  set\('kills')/)![0];
  for (const [hp, maxHp, expected] of [
    [12.25, 100, '13 / 100'],
    [9998.25, 9999, '9999 / 9999'],
    [9999.25, 10000, '1万 / 1万'],
    [18421.25, 184210000, '1.8万 / 1.8亿'],
    [184210000.25, 1842100000000, '1.8亿 / 1.8万亿'],
  ] as const) {
    const game = new Game(freshSave(), 0, 0, () => 0.5);
    game.player.hp = hp;
    game.player.maxHp = maxHp;
    const before = JSON.stringify(game.snapshot());
    const health = { style: { width: '' } };
    let text = '';
    runInNewContext(stripTypeScriptTypes(render), {
      game,
      formatNumber,
      set: (id: string, value: string) => {
        assert.equal(id, 'health-text');
        text = value;
      },
      document: { querySelector: () => health },
    });
    assert.equal(text, expected);
    assert.equal(health.style.width, `${(hp / maxHp) * 100}%`);
    assert.equal(JSON.stringify(game.snapshot()), before);
  }
});

test('伤害统计总量、法宝、反伤与未分类条目共用简写，保留取整和百分比精度', () => {
  const render = source.match(/function damageReport\([^]*?\n\}/)![0];
  for (const total of [36.75, 18421.25, 184210000.25, 1842100000000.25]) {
    const game = new Game(freshSave(), 0, 0, () => 0.5);
    game.damageDealt = total;
    game.damageBySource = { sword: total * 0.617, bone: total * 0.271 };
    const before = JSON.stringify(game.snapshot());
    const html = runInNewContext(`${stripTypeScriptTypes(render)}; damageReport()`, {
      game,
      formatNumber,
      treasure,
      passive,
      icon: () => '',
    });
    assert.ok(html.includes(`总伤害 ${formatNumber(Math.round(total))}</span>`));
    const { sword, bone } = game.damageBySource;
    for (const damage of [sword, bone, total - (sword + bone)]) {
      const percent = (damage / total) * 100;
      assert.ok(
        html.includes(
          `<span>${formatNumber(Math.round(damage))} <b>${percent.toFixed(1)}%</b></span>`,
        ),
      );
      assert.ok(html.includes(`style="width:${percent}%"`));
    }
    assert.equal(JSON.stringify(game.snapshot()), before);
  }
});

test('洞府当前与突破预览沿用入场 helper，气血、伤害及增量只格式化显示', () => {
  const preview = source.match(/else if \(panel === 'cultivation'\) \{([^]*?)\s+panelFrame\(/)![1];
  const template = source.match(/<p><strong>当前入场气血[^]*?<\/p>/)![0];
  for (const step of [0, 15, 18, 21, 23, 24]) {
    const save = freshSave();
    save.cultivation = Array.from({ length: step }, (_, i) => realmCost(i)).reduce(
      (a, b) => a + b,
      0,
    );
    if (step === 24) save.completed = [FINAL_TRIAL_STAGE];
    const before = JSON.stringify(save);
    const html = runInNewContext(`${stripTypeScriptTypes(preview)}; \`${template}\``, {
      save,
      realmInfo,
      spiritPower,
      FINAL_TRIAL_STAGE,
      formatNumber,
    });
    const current = spiritPower(save);
    assert.equal(current.hp, new Game({ ...save }, 0, 0, () => 0.5).player.maxHp);
    assert.ok(html.includes(`当前入场气血 ${formatNumber(current.hp)}</strong>`));
    assert.ok(
      html.includes(
        `${current.weapon}基础伤害约 ${formatNumber(Math.round(current.weaponDamage))}`,
      ),
    );
    const realm = realmInfo(save.cultivation, save.completed.includes(FINAL_TRIAL_STAGE));
    if (!realm.max) {
      const next = spiritPower({
        ...save,
        cultivation: save.cultivation + Math.max(0, realm.needed - realm.progress),
        completed: realm.step === 23 ? [...save.completed, FINAL_TRIAL_STAGE] : save.completed,
      });
      assert.ok(
        html.includes(`气血 ${formatNumber(next.hp)}（+${formatNumber(next.hp - current.hp)}）`),
      );
      assert.ok(
        html.includes(
          `本命基础伤害约 ${formatNumber(Math.round(next.weaponDamage))}（+${formatNumber(Math.round(next.weaponDamage) - Math.round(current.weaponDamage))}）`,
        ),
      );
    } else {
      assert.doesNotMatch(html, /下次突破后|修为达标并通关七境后/);
    }
    assert.equal(JSON.stringify(save), before);
  }
});

test('通关页保留万、亿和万亿缩写及一位小数，完整数值提示不加千分位', () => {
  // 单独执行原有纯模板函数，不启动 main 的 DOM、音频与存档流程。
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
