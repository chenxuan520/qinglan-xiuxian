import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../workers/leaderboard/index.ts';
import { createFactsSeal } from '../../src/leaderboard/leaderboard-integrity.ts';
import { extractLeaderboardFacts } from '../../src/leaderboard/leaderboard-contract.ts';
import { freshSave } from '../../src/core/progress.ts';
import { journeyScore } from '../../src/content/journey-score.ts';
import { grantCurio } from '../../src/items/curio-data.ts';
import {
  leaderboardStore,
  leaderboardUrl,
  submitLeaderboard,
  anonymousCookie,
} from '../helpers/leaderboard.ts';

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
test('部署短过渡期也不重新开放缺摘要或v1，错误摘要、到期和异常远期配置均拒绝', async () => {
  const store = leaderboardStore();
  try {
    const body = { version: 1, name: '过渡甲', facts: facts() };
    store.env.LEGACY_SEAL_UNTIL = new Date(Date.now() + 60000).toISOString();
    assert.equal((await worker.fetch(rawRequest(body), store.env)).status, 400);
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
      const previous = { ...body, seal: createFactsSeal(body.facts, 2) };
      assert.equal((await worker.fetch(rawRequest(previous), store.env)).status, 400);
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

test('上一版事实v2仅在固定短过渡期验旧摘要后接受，到期拒绝，不洗白改动', async () => {
  const store = leaderboardStore();
  try {
    const old = facts();
    const body = { version: 1, name: '旧版署名', facts: old, seal: createFactsSeal(old, 2) };
    assert.equal((await worker.fetch(rawRequest(body), store.env)).status, 400);
    store.env.LEGACY_SEAL_UNTIL = new Date(Date.now() + 60000).toISOString();
    const cookie = await anonymousCookie(store, body);
    const accepted = await worker.fetch(submitLeaderboard(body, cookie), store.env);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).status, 'saved');
    assert.equal(
      (await worker.fetch(rawRequest({ ...body, facts: { ...old, age: old.age + 1 } }), store.env))
        .status,
      400,
    );
    assert.equal(
      (
        await worker.fetch(
          rawRequest({ ...body, facts: { ...old, inheritanceValue: old.inheritanceValue + 1 } }),
          store.env,
        )
      ).status,
      400,
    );
    store.env.LEGACY_SEAL_UNTIL = new Date(Date.now() - 1).toISOString();
    assert.equal((await worker.fetch(rawRequest(body), store.env)).status, 400);
    assert.equal(store.rows().length, 1);
  } finally {
    store.close();
  }
});

test('v3发布窗口不重新接受更早的v1真实摘要', async () => {
  const store = leaderboardStore();
  try {
    store.env.LEGACY_SEAL_UNTIL = new Date(Date.now() + 60000).toISOString();
    const { inheritanceValue, ...v1 } = facts();
    const old = { version: 1, name: '不重开旧窗口', facts: v1, seal: createFactsSeal(v1, 1) };
    assert.equal((await worker.fetch(rawRequest(old), store.env)).status, 400);
    assert.equal(store.rows().length, 0);
  } finally {
    store.close();
  }
});

test('持有养魂木的三项根基新道果与Worker实际入榜重算一致', async () => {
  const store = leaderboardStore();
  try {
    const save = freshSave('heaven', ['metal'], 'dual', () => 0.5);
    save.training = { vitality: 20, power: 20, speed: 20 };
    save.age = 100;
    save.pendingReincarnation = 'lifespan';
    const plain = journeyScore(save).total;
    grantCurio(save, 'soul-wood');
    const expected = journeyScore(save).total;
    assert.ok(expected > plain);
    const f = extractLeaderboardFacts(save)!;
    const body = { version: 1, name: '养魂根基', facts: f, seal: createFactsSeal(f) };
    assert.equal(body.seal.v, 3);
    const cookie = await anonymousCookie(store, body);
    const response = await worker.fetch(submitLeaderboard(body, cookie), store.env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).entry.score, expected);
    assert.equal(store.rows()[0].score, expected);
  } finally {
    store.close();
  }
});
