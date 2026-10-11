import test from 'node:test';
import assert from 'node:assert/strict';
import { TREASURES, FINAL_TRIAL_STAGE, ROOT_STARTERS, treasure } from '../src/data.ts';
import { MEDICINES } from '../src/medicine-data.ts';
import {
  freshSave,
  inheritanceChoices,
  resolveInheritance,
  applyBirthInheritance,
  parseSave,
  validInheritance,
  validBirthInheritance,
} from '../src/progress.ts';
import { departHometown, acceptHometownRoot } from '../src/hometown.ts';
import { importSave, exportSave } from '../src/save-transfer.ts';
import { inheritanceContent } from '../src/inheritance-ui.ts';

const immortal = () => {
  const save = freshSave('heaven', ['earth'], 'demonic');
  save.cultivation = 119940;
  save.completed = [FINAL_TRIAL_STAGE];
  save.artifacts = TREASURES.map((t) => t.id);
  return save;
};
test('只有真仙可选择实际拥有的遗物，渡劫、空丹囊、未收藏法宝均不可', () => {
  const save = immortal();
  assert.equal(inheritanceChoices(save).length, TREASURES.length);
  save.completed = [];
  assert.deepEqual(inheritanceChoices(save), []);
  assert.equal(inheritanceContent(save), '');
  assert.equal(resolveInheritance(save, 'artifact:skull'), null);
  save.completed = [FINAL_TRIAL_STAGE];
  save.cultivation--;
  assert.deepEqual(inheritanceChoices(save), []);
  save.cultivation++;
  save.artifacts = ['sword'];
  save.medicine.bag.huanglong = 0;
  assert.equal(resolveInheritance(save, 'artifact:skull'), null);
  assert.equal(resolveInheritance(save, 'medicine:huanglong'), null);
  save.medicine.bag.huanglong = 28;
  assert.deepEqual(resolveInheritance(save, 'medicine:huanglong'), {
    kind: 'medicine',
    id: 'huanglong',
  });
  assert.equal(resolveInheritance(save, 'invalid'), null);
  assert.equal(resolveInheritance(save, ''), null);
});
test('三十六法宝的零阶、五阶、十阶均保留，只有新本命对和一件遗物，不替换灵根路线本命', () => {
  const old = immortal();
  for (const t of TREASURES)
    for (const level of [0, 5, 10]) {
      old.forge[t.id] = level;
      const before = JSON.stringify(old);
      const gift = resolveInheritance(old, `artifact:${t.id}`)!;
      const next = freshSave('triple', ['wood', 'water', 'earth'], 'orthodox');
      const starter = next.starter;
      assert.equal(applyBirthInheritance(next, gift), true);
      assert.equal(next.starter, starter);
      assert.equal(next.path, 'orthodox');
      assert.equal(next.spiritRoot, 'triple');
      assert.equal(next.forge[t.id], level);
      assert.deepEqual(next.artifacts, [
        ...new Set([...ROOT_STARTERS[treasure(starter).element], t.id]),
      ]);
      assert.deepEqual(next.medicine.bag, {});
      assert.equal(next.stones + next.iron + next.cultivation + next.runs, 0);
      assert.deepEqual(next.training, { vitality: 0, power: 0, speed: 0 });
      assert.equal(JSON.stringify(old), before);
      departHometown(next);
      const restored = importSave(exportSave(next, null)).save;
      assert.deepEqual(restored.birthInheritance, gift);
      assert.equal(restored.forge[t.id], level);
      assert.ok(restored.artifacts.includes(t.id));
      acceptHometownRoot(restored);
      assert.equal(validBirthInheritance(restored, gift), false);
    }
});
test('所有丹药均只能留一枚，不继承库存、药效、药方与本世服用提升，重复应用不叠加', () => {
  const old = immortal();
  old.medicine.bag = Object.fromEntries(MEDICINES.map((m) => [m.id, 28]));
  for (const m of MEDICINES) {
    const gift = resolveInheritance(old, `medicine:${m.id}`)!;
    const next = freshSave();
    assert.equal(applyBirthInheritance(next, gift), true);
    assert.equal(applyBirthInheritance(next, gift), true);
    assert.deepEqual(next.medicine.bag, { [m.id]: 1 });
    assert.deepEqual(next.medicine.active, {});
    assert.deepEqual(next.medicine.used, {});
    assert.deepEqual(next.medicine.recipes, []);
    const restored = parseSave(JSON.stringify(next));
    assert.deepEqual(restored.birthInheritance, gift);
    assert.deepEqual(restored.medicine.bag, next.medicine.bag);
    assert.equal(old.medicine.bag[m.id], 28);
  }
});
test('传承元数据损坏或与库存不符时，导入拒绝；本机读取丢弃元数据，不制造遗物', () => {
  for (const gift of [
    { kind: 'artifact', id: 'skull', level: 11 },
    { kind: 'artifact', id: 'skull', level: 5 },
    { kind: 'artifact', id: 'missing', level: 0 },
    { kind: 'medicine', id: 'huanglong' },
    { kind: 'medicine', id: 'missing' },
    [],
    true,
  ]) {
    const save = freshSave('heaven', ['metal'], 'orthodox');
    const raw = JSON.stringify({ ...save, birthInheritance: gift });
    assert.equal(parseSave(raw).birthInheritance, null);
    assert.throws(() => importSave(raw), /传承遗物/);
  }
  assert.equal(validInheritance({ kind: 'artifact', id: 'sword', level: 0.5 }), false);
  const played = immortal();
  assert.equal(applyBirthInheritance(played, { kind: 'medicine', id: 'huanglong' }), false);
});
