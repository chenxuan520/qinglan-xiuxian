import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNpcDialogue, NPC_AI_BASE, mountTeaStory, closeNpcChat } from '../src/npc-chat.ts';
import { freshSave } from '../src/progress.ts';

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

test('说书接受较长正文，断网、空值与超限仅返回空结果', async () => {
  const story = { ...input, mode: 'tea-story', npcId: 'tea' };
  const signal = new AbortController().signal;
  assert.equal(
    await requestNpcDialogue(story, signal, async () => Response.json({ reply: '字'.repeat(500) })),
    '字'.repeat(500),
  );
  for (const response of [
    Response.json({ reply: '字'.repeat(901) }),
    Response.json({ reply: '' }),
    new Response(null, { status: 503 }),
  ])
    assert.equal(await requestNpcDialogue(story, signal, async () => response), null);
});

function storyHost() {
  const nodes = Object.fromEntries(
    ['text', 'status', 'play', 'stop'].map((name) => [
      `.tea-story-${name}`,
      {
        textContent: '',
        hidden: true,
        disabled: name === 'stop',
        addEventListener() {},
      },
    ]),
  );
  return {
    isConnected: true,
    querySelector: (selector: string) => nodes[selector],
    setAttribute() {},
    nodes,
  };
}

test('说书正文只写入文本，失败不补固定故事，关闭后丢弃迟到结果且不修改存档', async (t) => {
  const save = freshSave();
  save.mortal.population = input.population;
  const snapshot = JSON.stringify(save);
  const host = storyHost();
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ reply: '<img src=x onerror=alert(1)>仙途旧事' }),
  );
  await mountTeaStory(host, save, () => assert.fail('不能自动开启声音'));
  assert.equal(host.nodes['.tea-story-text'].textContent, '<img src=x onerror=alert(1)>仙途旧事');
  closeNpcChat();
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  const offline = storyHost();
  await mountTeaStory(offline, save, () => {});
  assert.equal(offline.nodes['.tea-story-text'].textContent, '');
  assert.equal(offline.nodes['.tea-story-play'].hidden, true);
  assert.match(offline.nodes['.tea-story-status'].textContent, /说书暂歇/);
  let resolve;
  let signal;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const late = storyHost();
  const pending = mountTeaStory(late, save, () => {});
  closeNpcChat();
  assert.equal(signal.aborted, true);
  resolve(Response.json({ reply: '迟到的故事' }));
  await pending;
  assert.equal(late.nodes['.tea-story-text'].textContent, '');
  assert.equal(JSON.stringify(save), snapshot);
});
