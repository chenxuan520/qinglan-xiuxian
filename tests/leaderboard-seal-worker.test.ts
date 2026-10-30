import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/leaderboard/index.ts';
import { createFactsSeal } from '../src/leaderboard-integrity.ts';
import { extractLeaderboardFacts } from '../src/leaderboard-contract.ts';
import { freshSave } from '../src/progress.ts';
import {
  leaderboardStore,
  leaderboardUrl,
  submitLeaderboard,
  anonymousCookie,
} from './helpers/leaderboard.ts';

const facts = () => {
  const save = freshSave();
  save.lifeMode = 'extreme';
  save.pendingReincarnation = 'extreme';
  save.age = 100;
  return extractLeaderboardFacts(save)!;
};
function rawRequest(body: unknown) {
  return new Request(leaderboardUrl, {
    method: 'POST',
    headers: {
      Origin: 'https://xiuxian.011203.xyz',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.19',
    },
    body: JSON.stringify(body),
  });
}
test('服务端默认必须带受支持且匹配事实的摘要，缺少/伪造/未知版本均拒绝且不写库', async () => {
  const store = leaderboardStore();
  try {
    const f = facts(),
      seal = await createFactsSeal(f),
      base = { version: 1, name: '核验甲', facts: f };
    for (const extra of [
      {},
      { seal: null },
      { seal: { ...seal, h: '0'.repeat(64) } },
      { seal: { ...seal, v: 999 } },
    ]) {
      const response = await worker.fetch(rawRequest({ ...base, ...extra }), store.env);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'invalid-input');
      assert.equal(store.rows().length, 0);
    }
    const valid = { ...base, seal };
    const cookie = await anonymousCookie(store, valid);
    const accepted = await worker.fetch(submitLeaderboard(valid, cookie), store.env);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).status, 'saved');
  } finally {
    store.close();
  }
});
test('部署短过渡期仅临时接受缺摘要，错误摘要仍拒绝，到期和异常远期配置均收紧', async () => {
  const store = leaderboardStore();
  try {
    const body = { version: 1, name: '过渡甲', facts: facts() };
    store.env.LEGACY_SEAL_UNTIL = new Date(Date.now() + 60000).toISOString();
    assert.equal((await worker.fetch(rawRequest(body), store.env)).status, 428);
    const bad = await worker.fetch(
      rawRequest({ ...body, seal: { v: 1, h: '0'.repeat(64) } }),
      store.env,
    );
    assert.equal(bad.status, 400);
    for (const value of [
      '',
      new Date(Date.now() - 1).toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
      'invalid',
    ]) {
      store.env.LEGACY_SEAL_UNTIL = value;
      assert.equal((await worker.fetch(rawRequest(body), store.env)).status, 400);
    }
    assert.equal(store.rows().length, 0);
  } finally {
    store.close();
  }
});

test('正文上限内的深层非法事实拒绝为400，不递归溢出或误报存储故障', async () => {
  const store = leaderboardStore();
  try {
    const nested = '['.repeat(4500) + '0' + ']'.repeat(4500);
    const response = await worker.fetch(
      new Request(leaderboardUrl, {
        method: 'POST',
        headers: {
          Origin: 'https://xiuxian.011203.xyz',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.19',
        },
        body:
          '{"version":1,"name":"深层","facts":' +
          nested +
          ',"seal":{"v":1,"h":"' +
          '0'.repeat(64) +
          '"}}',
      }),
      store.env,
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid-input');
    assert.equal(store.rows().length, 0);
  } finally {
    store.close();
  }
});
