import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCases } from '../../../scripts/balance/balance-gate.ts';
import { balanceCases, caseKey } from '../../../scripts/balance/balance-policy.ts';
import { makeImportedCampaignFixture } from '../../helpers/balance-import-fixture.ts';

const cases = Array.from({ length: 6 }, (_, i) => ({ ...balanceCases(false)[0], seed: i + 1 }));
const expected = cases.map((c) => makeImportedCampaignFixture(c, false));

function fixture(body = '') {
  const root = mkdtempSync(join(tmpdir(), 'qinglan-worker-test-'));
  const directory = join(root, 'scripts/balance');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  // 独立工作树中的合成模拟器，只测调度协议，不作为游戏胜率证据。
  writeFileSync(
    join(directory, 'balance-simulation.ts'),
    `import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
     import { parentPort, threadId, workerData } from 'node:worker_threads';
     const root = ${JSON.stringify(root)};
     const rows = ${JSON.stringify(expected)};
     if (workerData.cases.length !== 0) throw Error('不能预分配静态批次');
     export function simulateCampaign(c, stageCount, autoplayBuild) {
       appendFileSync(root + '/calls.jsonl', JSON.stringify({seed:c.seed,threadId,stageCount,autoplayBuild})+'\\n');
       const row = rows.find(r => r.case.seed === c.seed);
       ${body}
       return row;
     }`,
  );
  return root;
}

test('空闲worker继续取样本：首条阻塞时另一worker完成全部余项，每项恰好一次', async () => {
  const root = fixture(`
    if (c.seed === 1) {
      const end = Date.now() + 10000;
      while (!existsSync(root + '/last-done') && Date.now() < end)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      if (!existsSync(root + '/last-done')) throw Error('空闲worker没有领取余项');
    }
    if (c.seed === 6) writeFileSync(root + '/last-done', 'done');
  `);
  try {
    const build = { mode: 'survival' as const, targets: Array(6).fill('') };
    const result = await runCases(cases, root, 2, '动态调度夹具', 6, build);
    assert.deepEqual(result, { results: expected, errors: [] });
    const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(calls.map((c) => c.seed).sort(), [1, 2, 3, 4, 5, 6]);
    assert.equal(new Set(calls.filter((c) => c.seed !== 1).map((c) => c.threadId)).size, 1);
    assert.notEqual(
      calls.find((c) => c.seed === 1).threadId,
      calls.find((c) => c.seed === 2).threadId,
    );
    assert.ok(calls.every((c) => c.stageCount === 6));
    assert.ok(calls.every((c) => JSON.stringify(c.autoplayBuild) === JSON.stringify(build)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('模拟异常保留原case身份并继续领取，剩余样本不能丢失', async () => {
  const root = fixture("if (c.seed === 2) throw Error('模拟失败夹具');");
  try {
    const result = await runCases(cases, root, 2, '错误调度夹具');
    assert.deepEqual(
      result.results,
      expected.filter((r) => r.case.seed !== 2),
    );
    assert.deepEqual(result.errors, [
      { case: cases[1], key: caseKey(cases[1]), error: '模拟失败夹具' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, body, message] of [
  ['错误任务身份', "return {...row,key:'wrong-case'};", /非当前任务/],
  ['重复结果', 'parentPort.postMessage(row);', /非当前任务|重复 worker/],
  ['提前正常退出', 'process.exit(0);', /worker 样本缺失/],
  ['异常退出', 'process.exit(7);', /模拟 worker 退出 7/],
] as const)
  test(`${name}使整个运行失败并保存原始诊断`, async () => {
    const root = fixture(body);
    const logs: string[] = [];
    const original = console.error;
    console.error = (message) => logs.push(String(message));
    try {
      await assert.rejects(runCases(cases, root, 2, name), message);
      const file = logs.find((line) => line.includes('原始样本已保留：'))!.split('：')[1];
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(raw.label, name);
      assert.deepEqual(raw.cases, cases);
      assert.ok(Array.isArray(raw.results) && Array.isArray(raw.errors));
    } finally {
      console.error = original;
      rmSync(root, { recursive: true, force: true });
    }
  });

test('零样本不启动worker；非法并发数拒绝；样本少于worker数仍全部返回', async () => {
  assert.deepEqual(await runCases([], '/does-not-exist', 4, '空任务'), { results: [], errors: [] });
  for (const jobs of [0, -1, 1.5, NaN, Infinity])
    await assert.rejects(runCases([], '/does-not-exist', jobs, '非法并发'), /并发数/);
  const root = fixture();
  try {
    assert.deepEqual(await runCases(cases.slice(0, 1), root, 4, '少量任务'), {
      results: expected.slice(0, 1),
      errors: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
