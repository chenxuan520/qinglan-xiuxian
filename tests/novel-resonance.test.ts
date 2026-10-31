import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchAction, type ActionShell } from '../src/action-controller.ts';
import { grantCurio } from '../src/curio-data.ts';
import { MAX_FORGE_LEVEL, TREASURES } from '../src/data.ts';
import { inspectSaveIntegrity, sealSaveSnapshot } from '../src/leaderboard-integrity.ts';
import { townEventContent, townStatus } from '../src/mortal-ui.ts';
import {
  canTriggerNovelResonance,
  claimNovelResonance,
  handleNovelResonance,
  hasNovelResonanceClaimed,
  NOVEL_RESONANCE_FALLBACK_IRON,
  NOVEL_TEA_ARTIFACTS,
  novelResonanceContent,
  novelResonanceTarget,
} from '../src/novel-resonance.ts';
import {
  applyBirthInheritance,
  freshSave,
  lifespanInfo,
  readSave,
  tribulationDue,
  type SaveData,
} from '../src/progress.ts';
import { exportSave, importSave } from '../src/save-transfer.ts';
import { freshTownPopulation, townResidents } from '../src/town-population.ts';

function createSave(): SaveData {
  const save = readSave(JSON.stringify(freshSave('heaven', ['metal'], 'orthodox', () => 0.5))).save;
  save.prologueSeen = save.hometownSeen = true;
  save.mortal.hometown!.stage = 'departed';
  save.mortal.population = freshTownPopulation(save.age, () => 0.5);
  Object.assign(save, sealSaveSnapshot(save));
  return save;
}

test('茶馆旧器同途需齐备青霄剑、九霄雷符与玄天伞，按最低阶升一阶，全十阶折算15玄铁，本世限一次', () => {
  const save = createSave();
  save.artifacts = ['sword', 'lightning'];
  assert.equal(canTriggerNovelResonance(save, 'tea'), false);
  assert.equal(novelResonanceContent(save, 'tea'), '');
  assert.equal(claimNovelResonance(save, 'tea'), false);

  save.artifacts = ['sword', 'lightning', 'umbrella'];
  save.forge.sword = 3;
  save.forge.lightning = 1;
  save.forge.umbrella = 1;
  assert.equal(canTriggerNovelResonance(save, 'tea'), true);
  // 同为最低阶时按 青霄剑 -> 九霄雷符 -> 玄天伞 顺序选择
  assert.deepEqual(novelResonanceTarget(save, 'tea'), {
    id: 'lightning',
    name: '九霄雷符',
    level: 1,
  });
  const beforeClaimHtml = novelResonanceContent(save, 'tea');
  assert.match(beforeClaimHtml, /请老匠校器 · 九霄雷符炼器 \+1 阶（1 → 2 阶）/);

  assert.equal(claimNovelResonance(save, 'tea'), true);
  assert.equal(save.forge.lightning, 2);
  assert.equal(hasNovelResonanceClaimed(save, 'tea'), true);
  assert.equal(canTriggerNovelResonance(save, 'tea'), false);
  assert.equal(claimNovelResonance(save, 'tea'), false);
  assert.equal(save.forge.lightning, 2);

  const afterClaimHtml = novelResonanceContent(save, 'tea');
  assert.match(afterClaimHtml, /此世已记/);
  assert.doesNotMatch(afterClaimHtml, /data-action="novel-resonance"/);
  assert.equal(save.chronicle.entries[0].title, '旧器同途');
  assert.match(save.chronicle.entries[0].detail, /九霄雷符炼器升至 2 阶/);

  // 升至十阶触发炉火纯青成就
  const tenSave = createSave();
  tenSave.artifacts = [...NOVEL_TEA_ARTIFACTS];
  tenSave.forge.sword = 10;
  tenSave.forge.lightning = 10;
  tenSave.forge.umbrella = 9;
  assert.equal(claimNovelResonance(tenSave, 'tea'), true);
  assert.equal(tenSave.forge.umbrella, MAX_FORGE_LEVEL);
  assert.ok(Object.hasOwn(tenSave.chronicle.milestones, 'forge'));

  // 三件均满十阶时折算15玄铁
  const maxSave = createSave();
  maxSave.artifacts = [...NOVEL_TEA_ARTIFACTS];
  for (const id of NOVEL_TEA_ARTIFACTS) maxSave.forge[id] = MAX_FORGE_LEVEL;
  assert.equal(novelResonanceTarget(maxSave, 'tea'), null);
  assert.match(
    novelResonanceContent(maxSave, 'tea'),
    new RegExp(`收下炉边余铁 · 玄铁 \\+${NOVEL_RESONANCE_FALLBACK_IRON}`),
  );
  assert.equal(claimNovelResonance(maxSave, 'tea'), true);
  assert.equal(maxSave.iron, NOVEL_RESONANCE_FALLBACK_IRON);
  assert.match(maxSave.chronicle.entries[0].detail, /赠玄铁 15 枚/);
});

test('码头渡口旧玉需持有玉如意，优先升本命，本命满阶顺延其他已藏法宝，全满折算15玄铁，与茶馆互不挤占', () => {
  const save = createSave();
  assert.equal(canTriggerNovelResonance(save, 'dock'), false);
  assert.equal(novelResonanceContent(save, 'dock'), '');

  grantCurio(save, 'jade-ruyi');
  save.starter = 'sword';
  save.artifacts = ['sword', 'scythe', 'umbrella'];
  save.forge.sword = 4;
  save.forge.scythe = 0;
  assert.equal(canTriggerNovelResonance(save, 'dock'), true);
  // 即使其他法宝阶数更低，只要本命未满十阶也优先升本命
  assert.deepEqual(novelResonanceTarget(save, 'dock'), {
    id: 'sword',
    name: '青霄剑',
    level: 4,
  });
  assert.match(novelResonanceContent(save, 'dock'), /借旧石打磨 · 青霄剑炼器 \+1 阶（4 → 5 阶）/);

  assert.equal(claimNovelResonance(save, 'dock'), true);
  assert.equal(save.forge.sword, 5);
  assert.equal(hasNovelResonanceClaimed(save, 'dock'), true);
  assert.equal(claimNovelResonance(save, 'dock'), false);
  assert.equal(save.chronicle.entries[0].title, '渡口旧玉');

  // 同一世还可继续在茶馆触发旧器同途
  save.artifacts.push('lightning');
  assert.equal(canTriggerNovelResonance(save, 'tea'), true);
  assert.equal(claimNovelResonance(save, 'tea'), true);
  assert.equal(hasNovelResonanceClaimed(save, 'tea'), true);

  // 导出导入往返一致且防篡改封签有效
  const exported = exportSave(save, null);
  const imported = importSave(exported).save;
  assert.equal(hasNovelResonanceClaimed(imported, 'dock'), true);
  assert.equal(hasNovelResonanceClaimed(imported, 'tea'), true);
  assert.equal(inspectSaveIntegrity(JSON.parse(exported).save, 'import'), false);

  // 本命满十阶时顺延其他最低阶未满法宝，且承缘玉如意在接受命盘清空 birthInheritance 后仍显示专属文案
  const inheritedRaw = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  assert.equal(applyBirthInheritance(inheritedRaw, { kind: 'curio', id: 'jade-ruyi' }), true);
  inheritedRaw.birthInheritance = null;
  inheritedRaw.mortal.hometown!.stage = 'departed';
  const inheritedSave = importSave(exportSave(inheritedRaw, null)).save;
  assert.equal(inheritedSave.birthInheritance, null);
  inheritedSave.starter = 'sword';
  inheritedSave.artifacts = ['sword', 'scythe'];
  inheritedSave.forge.sword = MAX_FORGE_LEVEL;
  inheritedSave.forge.scythe = 2;
  assert.match(novelResonanceContent(inheritedSave, 'dock'), /如今前人所赠之物仍在护持新程/);
  assert.deepEqual(novelResonanceTarget(inheritedSave, 'dock'), {
    id: 'scythe',
    name: '摄魂镰',
    level: 2,
  });
  assert.equal(claimNovelResonance(inheritedSave, 'dock'), true);
  assert.equal(inheritedSave.forge.scythe, 3);

  // 承缘其他物品但后天获得玉如意时，显示普通偶得文案而非前人所赠文案
  const otherInherited = freshSave('heaven', ['metal'], 'orthodox', () => 0.5);
  assert.equal(applyBirthInheritance(otherInherited, { kind: 'curio', id: 'heaven-house' }), true);
  otherInherited.birthInheritance = null;
  otherInherited.mortal.hometown!.stage = 'departed';
  grantCurio(otherInherited, 'jade-ruyi');
  assert.match(novelResonanceContent(otherInherited, 'dock'), /留给问路的少年/);
  assert.doesNotMatch(
    novelResonanceContent(otherInherited, 'dock'),
    /如今前人所赠之物仍在护持新程/,
  );

  // 所有已收藏法宝均满十阶时折算15玄铁
  const allMax = createSave();
  grantCurio(allMax, 'jade-ruyi');
  allMax.artifacts = TREASURES.slice(0, 3).map((t) => t.id);
  for (const id of allMax.artifacts) allMax.forge[id] = MAX_FORGE_LEVEL;
  assert.equal(novelResonanceTarget(allMax, 'dock'), null);
  assert.equal(claimNovelResonance(allMax, 'dock'), true);
  assert.equal(allMax.iron, NOVEL_RESONANCE_FALLBACK_IRON);
});

test('真实控制器先保存后应用，保存失败不改状态且可重试，错误镇民或落幕状态拒绝', () => {
  const save = createSave();
  save.artifacts = [...NOVEL_TEA_ARTIFACTS];
  grantCurio(save, 'jade-ruyi');
  const teaNpc = townResidents(save.mortal.population!, save.age).find((n) => n.id === 'tea')!;
  const fisherNpc = townResidents(save.mortal.population!, save.age).find(
    (n) => n.id === 'fisher',
  )!;
  let failWrite = true;
  let writes = 0;
  let statusHtml = '';
  const toasts: string[] = [];
  const renderModal = (npc: typeof teaNpc) =>
    townEventContent(save, npc).replace(
      '<div data-novel-resonance></div>',
      `<div data-novel-resonance>${novelResonanceContent(save, npc.id)}</div>`,
    );
  const shell = {
    save,
    game: null,
    settled: false,
    pendingRun: null,
    inMortalWorld: true,
    inTown: true,
    panel: 'town-event',
    saveLock: null,
    structuredClone,
    tribulationDue,
    lifespanInfo,
    medicinePanel: { handle: () => false },
    townNpc: teaNpc,
    townScene: { nearbyNpc: teaNpc },
    townSource: { current: { handleNovelResonance, novelResonanceContent } },
    townStatus,
    modal: { innerHTML: renderModal(teaNpc) },
    document: {
      getElementById: (id: string) =>
        id === 'town-status'
          ? {
              set innerHTML(value: string) {
                statusHtml = value;
              },
            }
          : null,
    },
    showTownEvent(npc: typeof teaNpc) {
      shell.modal.innerHTML = renderModal(npc);
    },
    toast(msg: string) {
      toasts.push(msg);
    },
    writeSave(next: SaveData) {
      if (failWrite) throw new DOMException('quota', 'QuotaExceededError');
      Object.assign(next, sealSaveSnapshot(next));
      writes++;
    },
  } as unknown as ActionShell;

  // 在茶馆掌柜旁不能触发码头的 dock
  dispatchAction(shell, 'novel-resonance', 'dock');
  assert.equal(writes, 0);
  assert.equal(hasNovelResonanceClaimed(save, 'dock'), false);

  // 保存失败时不修改内存存档，按钮仍在
  const snapshot = structuredClone(save);
  dispatchAction(shell, 'novel-resonance', 'tea');
  assert.deepEqual(save, snapshot);
  assert.match(shell.modal.innerHTML, /data-action="novel-resonance" data-id="tea"/);
  assert.match(toasts.at(-1) ?? '', /暂时无法保存/);

  // 恢复保存后重试成功，面板按钮转为已记状态
  failWrite = false;
  dispatchAction(shell, 'novel-resonance', 'tea');
  assert.equal(writes, 1);
  assert.equal(save.forge.sword, 1);
  assert.equal(hasNovelResonanceClaimed(save, 'tea'), true);
  assert.doesNotMatch(shell.modal.innerHTML, /data-action="novel-resonance"/);
  assert.match(statusHtml, /灵石/);

  // 重复点击不再写入
  dispatchAction(shell, 'novel-resonance', 'tea');
  assert.equal(writes, 1);
  assert.equal(save.forge.sword, 1);

  // 切换到渔夫处领取渡口旧玉
  shell.townNpc = fisherNpc;
  shell.townScene.nearbyNpc = fisherNpc;
  shell.modal.innerHTML = renderModal(fisherNpc);
  assert.match(shell.modal.innerHTML, /data-action="novel-resonance" data-id="dock"/);
  dispatchAction(shell, 'novel-resonance', 'dock');
  assert.equal(writes, 2);
  assert.equal(save.forge.sword, 2);
  assert.equal(hasNovelResonanceClaimed(save, 'dock'), true);
  assert.doesNotMatch(shell.modal.innerHTML, /data-action="novel-resonance"/);
});
