import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNpcDialogue, NPC_AI_BASE } from '../src/npc-chat.ts';

const input = {
  population: { seed: 12345, since: 15 },
  age: 15,
  npcId: 'smith',
  realm: '炼气初期',
  message: '近来如何？',
  history: [],
};
test('NPC 默认调用已绑定域名，只提交对白上下文，失败和空响应交由本地兜底', async () => {
  const before = JSON.stringify(input);
  const signal = new AbortController().signal;
  assert.equal(NPC_AI_BASE, 'https://qinglan-npc-ai.011203.xyz');
  const reply = await requestNpcDialogue(input, signal, async (url, options) => {
    assert.equal(url, `${NPC_AI_BASE}/chat`);
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(JSON.parse(options.body), input);
    return Response.json({ reply: '炉火正旺。' });
  });
  assert.equal(reply, '炉火正旺。');
  assert.equal(JSON.stringify(input), before);
  for (const response of [
    Response.json({ error: 'unavailable' }, { status: 503 }),
    Response.json({ reply: '' }),
    Response.json({ reply: '字'.repeat(301) }),
    new Response('not-json'),
  ])
    assert.equal(await requestNpcDialogue(input, signal, async () => response), null);
  assert.equal(
    await requestNpcDialogue(input, signal, async () => {
      throw new Error('offline');
    }),
    null,
  );
});
test('等待超时与关闭对话均中止 NPC 请求，不无限等待', async () => {
  let aborted = 0;
  const pending = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted++;
        reject(new Error('aborted'));
      });
    });
  assert.equal(await requestNpcDialogue(input, new AbortController().signal, pending, 10), null);
  const controller = new AbortController();
  const request = requestNpcDialogue(input, controller.signal, pending);
  controller.abort();
  assert.equal(await request, null);
  assert.equal(aborted, 2);
  assert.equal(
    await requestNpcDialogue(input, controller.signal, () => {
      throw new Error('should-not-fetch');
    }),
    null,
  );
});
