import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, type SaveData } from '../src/progress.ts';
import { CURIO_IDS, grantCurio } from '../src/curio-data.ts';
import { showTownEvent } from '../src/scene-flow.ts';
import { immortalEncounterPanel } from '../src/town-host.ts';
import type { ActionShell } from '../src/action-controller.ts';
import { medicineInfo } from '../src/medicine-data.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { meetTownImmortal, visitTownImmortal, validTownImmortal } from '../src/town-immortal.ts';

const traveller = () => {
  const save = freshSave();
  save.age = 1015;
  save.cultivation = 20000;
  save.mortal.scenery = { lastVisitAge: 15, revision: 0 };
  return save;
};
const rolls =
  (...values: number[]) =>
  () => {
    assert.ok(values.length, '不应多抽随机数');
    return values.shift()!;
  };

test('首次入镇与距上次不足千年不抽，满千年只判定一次且50%出现', () => {
  const save = traveller();
  const noRoll = () => {
    throw new Error('不应抽取');
  };
  visitTownImmortal(save, undefined, noRoll);
  visitTownImmortal(save, 15.01, noRoll);
  assert.equal(save.mortal.immortal, undefined);
  visitTownImmortal(save, 15, rolls(0.4999, 0.5, 0, 0));
  assert.ok(save.mortal.immortal);
  assert.match(save.mortal.immortal.npcId, /^villager-/);
  const encounter = structuredClone(save.mortal.immortal);
  visitTownImmortal(save, 1015, noRoll);
  assert.deepEqual(save.mortal.immortal, encounter);
  save.age += 1000;
  visitTownImmortal(save, 1015, rolls(0.5));
  assert.equal(save.mortal.immortal, null);
});

test('仙人赠礼20%时效珍品、40%奇物、40%本世珍品，不受妖王关卡池限制', () => {
  const counts = { timed: 0, curio: 0, permanent: 0 };
  for (let n = 0; n < 1000; n++) {
    const save = traveller(),
      roll = n / 1000;
    visitTownImmortal(save, 15, rolls(0, 0, roll, 0, 0));
    const e = save.mortal.immortal!;
    const m = medicineInfo(e.medicineId)!;
    assert.equal(m.tier, '珍品');
    counts[e.curioId ? 'curio' : m.years ? 'timed' : 'permanent']++;
  }
  assert.deepEqual(counts, { timed: 200, curio: 400, permanent: 400 });
  for (const roll of [0.199999, 0.2, 0.599999, 0.6, 0.999999]) {
    const save = traveller();
    visitTownImmortal(save, 15, rolls(0, 0, roll, 0.99999, 0.99999));
    const e = save.mortal.immortal!;
    assert.equal(!!e.curioId, roll >= 0.2 && roll < 0.6);
    assert.equal(!!medicineInfo(e.medicineId)!.years, roll < 0.2);
  }
});

test('交谈才获赠并留下经历，错误镇民、重复交谈和导入重进都不重复领', () => {
  let save: SaveData = traveller();
  visitTownImmortal(save, 15, rolls(0, 0, 0.8, 0));
  const encounter = structuredClone(save.mortal.immortal!);
  assert.deepEqual(save.medicine.bag, {});
  assert.equal(save.chronicle.entries.filter((e) => e.title === '市井逢仙').length, 0);
  assert.equal(meetTownImmortal(save, 'herbs', '王郎中'), false);
  save = importSave(exportSave(save, null)).save;
  assert.deepEqual(save.mortal.immortal, encounter);
  assert.equal(meetTownImmortal(save, encounter.npcId, '沈云归'), true);
  assert.equal(save.medicine.bag[encounter.medicineId], 1);
  const entry = save.chronicle.entries.find((e) => e.title === '市井逢仙')!;
  assert.equal(entry.age, 1015);
  assert.match(entry.detail, /沈云归/);
  assert.match(save.mortal.events[0], /沈云归/);
  save = importSave(exportSave(save, null)).save;
  assert.equal(meetTownImmortal(save, encounter.npcId, '沈云归'), false);
  assert.equal(save.medicine.bag[encounter.medicineId], 1);
  assert.equal(save.chronicle.entries.filter((e) => e.title === '市井逢仙').length, 1);
  assert.equal(save.mortal.events.filter((e) => e.includes('沈云归')).length, 1);
  assert.equal(freshSave().mortal.immortal, undefined);
});

test('奇遇导入校验拒绝错误镇民、丹药、年岁和领奖状态', () => {
  const save = traveller();
  visitTownImmortal(save, 15, rolls(0, 0, 0, 0));
  for (const patch of [
    { npcId: 'herbs' },
    { medicineId: 'huanglong' },
    { appearedAt: 1016 },
    { claimed: 1 },
    { curioId: 'unknown' },
    { curioId: 'soul-wood' },
  ]) {
    const bad = structuredClone(save);
    Object.assign(bad.mortal.immortal!, patch);
    assert.throws(() => importSave(JSON.stringify(bad)));
  }
});

test('九件奇物逐件排重，已售也不再出现；满藏或待结历练占用时改赠固定本世丹', () => {
  for (const wanted of CURIO_IDS) {
    const save = traveller();
    for (const id of CURIO_IDS.filter((id) => id !== wanted)) {
      grantCurio(save, id);
      delete save.curios.bag[id];
    }
    visitTownImmortal(save, 15, rolls(0, 0, 0.5, 0, 0.999));
    const e = save.mortal.immortal!;
    assert.equal(e.curioId, wanted);
    assert.ok(validTownImmortal(e, save.age));
    assert.equal(meetTownImmortal(save, e.npcId, '前辈'), true);
    assert.equal(save.curios.bag[wanted], 1);
    assert.equal(save.curios.acquired.length, 9);
    assert.equal(meetTownImmortal(save, e.npcId, '前辈'), false);
    const again = importSave(exportSave(save, null)).save;
    assert.equal(again.mortal.immortal!.curioId, wanted);
    assert.equal(again.curios.bag[wanted], 1);
    visitTownImmortal(save, 15, rolls(0, 0, 0.5, 0));
    assert.equal(save.mortal.immortal!.curioId, undefined);
    assert.equal(medicineInfo(save.mortal.immortal!.medicineId)!.years, 0);
  }
  for (const pending of [false, true]) {
    const save = traveller();
    visitTownImmortal(save, 15, rolls(0, 0, 0.5, 0, 0));
    const e = save.mortal.immortal!,
      id = e.curioId!,
      fallback = e.medicineId;
    if (!pending) grantCurio(save, id);
    assert.equal(meetTownImmortal(save, e.npcId, '前辈', pending ? { [id]: 1 } : {}), true);
    assert.equal(save.mortal.immortal!.curioId, undefined);
    assert.equal(save.medicine.bag[fallback], 1);
    assert.equal(save.curios.bag[id], pending ? undefined : 1);
  }
});

test('仙人真实控制器先保存再发礼，保存失败可重试，不显示假成功；行囊溢出不标已领', () => {
  for (const roll of [0, 0.5, 0.8]) {
    const save = traveller();
    visitTownImmortal(save, 15, rolls(0, 0, roll, 0, 0));
    const e = save.mortal.immortal!,
      before = structuredClone(save),
      npc = { id: e.npcId, name: '沈云归' };
    let fail = true,
      writes = 0,
      shown = 0;
    const shell = {
      save,
      inTown: true,
      townScene: { nearbyNpc: npc },
      saveLock: null,
      pendingRun: null,
      structuredClone,
      closeNpcChat() {},
      meetTownImmortal,
      immortalEncounterPanel,
      toast() {},
      panelFrame() {
        shown++;
      },
      writeSave() {
        if (fail) throw Error('storage failure');
        writes++;
      },
    } as unknown as ActionShell;
    showTownEvent(shell, npc as Parameters<typeof showTownEvent>[1]);
    assert.deepEqual(save, before);
    assert.equal(shown, 0);
    assert.equal(writes, 0);
    fail = false;
    showTownEvent(shell, npc as Parameters<typeof showTownEvent>[1]);
    assert.equal(save.mortal.immortal!.claimed, true);
    assert.equal(writes, 1);
    assert.equal(shown, 1);
    const granted = structuredClone(save);
    showTownEvent(shell, npc as Parameters<typeof showTownEvent>[1]);
    assert.deepEqual(save, granted);
    assert.equal(writes, 1);
    const html = immortalEncounterPanel(
      save,
      npc as Parameters<typeof immortalEncounterPanel>[1],
      false,
    ).join('');
    assert.match(html, /此前获赠/);
    assert.match(html, /现持有 1/);
    if (roll === 0.5) {
      assert.match(html, /curios.webp/);
      assert.doesNotMatch(html, /瓷瓶|赠药/);
    }
  }
  const save = traveller();
  visitTownImmortal(save, 15, rolls(0, 0, 0.8, 0));
  const e = save.mortal.immortal!;
  save.medicine.bag[e.medicineId] = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(save);
  assert.equal(meetTownImmortal(save, e.npcId, '前辈'), false);
  assert.deepEqual(save, before);
});

test('市井逢仙帮助同步三类奖励比例与唯一性、满藏替代规则', async () => {
  const { guideContent } = await import('../src/guide.ts');
  const { TOWN_IMMORTAL_REWARDS } = await import('../src/town-immortal.ts');
  const text = guideContent('mortal');
  const percentages = text.match(/(\d+)%为时效珍品丹药、(\d+)%为奇物、(\d+)%为本世珍品丹药/);
  assert.ok(percentages);
  assert.deepEqual(percentages.slice(1).map(Number), Object.values(TOWN_IMMORTAL_REWARDS));
  assert.match(text, /本世未曾获得者/);
  assert.match(text, /若已集齐/);
  assert.match(text, /每次相逢只赠一次/);
  assert.doesNotMatch(text, /首次交谈会获赠一份珍品/);
  assert.doesNotMatch(guideContent('medicine'), /首次与其交谈会获赠一份珍品/);
  assert.match(guideContent('medicine'), /获赠丹药或奇物/);
});
