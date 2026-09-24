import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestNpcDialogue,
  requestTeaStoryImage,
  NPC_AI_BASE,
  mountTeaStory,
  mountNpcChat,
  closeNpcChat,
} from '../src/npc-chat.ts';
import { freshSave } from '../src/progress.ts';
import { departHometown, acceptHometownRoot } from '../src/hometown.ts';
import { chooseSmithStory } from '../src/town-story.ts';
import { TEA_STORY_SETTINGS } from '../src/setting.ts';

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

test('父母请求只带家事上下文，AI成功使用回复，失败仍交回本地对白', async () => {
  const save = freshSave();
  departHometown(save);
  acceptHometownRoot(save);
  const before = JSON.stringify(save);
  const parentInput = { ...input, npcId: 'mother', hometown: save.mortal.hometown };
  const signal = new AbortController().signal;
  assert.equal(
    await requestNpcDialogue(parentInput, signal, async (_url, options) => {
      const sent = JSON.parse(options.body);
      assert.deepEqual(sent.hometown, save.mortal.hometown);
      assert.equal(sent.npcId, 'mother');
      assert.equal(sent.stones, undefined);
      assert.equal(sent.cultivation, undefined);
      return Response.json({ reply: '孩子，路远，记得添衣。' });
    }),
    '孩子，路远，记得添衣。',
  );
  assert.equal(
    await requestNpcDialogue(parentInput, signal, async () => new Response(null, { status: 503 })),
    null,
  );
  assert.equal(JSON.stringify(save), before);
});

test('推进铁匠故事不会清空父母闲谈或重复请求自动问候', async (t) => {
  const originalDocument = globalThis.document;
  const node = () => ({
    textContent: '',
    children: [],
    append(...children) {
      this.children.push(...children);
    },
  });
  globalThis.document = { createElement: node, createTextNode: (textContent) => ({ textContent }) };
  t.after(() => {
    closeNpcChat();
    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ reply: '孩子，回来就好。' });
  });
  const host = () => {
    const log = {
      ...node(),
      replaceChildren() {
        this.children = [];
      },
      setAttribute() {},
      scrollHeight: 0,
      scrollTop: 0,
    };
    const input = { value: '', disabled: false, focus() {} };
    const button = { disabled: false };
    const status = { textContent: '' };
    const form = {
      submit: null,
      querySelector: (selector) => (selector === 'input' ? input : button),
      addEventListener(_event, handler) {
        this.submit = handler;
      },
    };
    return {
      isConnected: true,
      log,
      input,
      form,
      querySelector: (selector) =>
        ({ '.npc-chat-log': log, form, '.npc-chat-status': status })[selector],
    };
  };
  const save = freshSave();
  save.mortal.population = { seed: 87654, since: 15 };
  departHometown(save);
  acceptHometownRoot(save);
  const person = { id: 'mother', name: '母亲', generation: 0 };
  const first = host();
  mountNpcChat(first, save, person);
  await new Promise((resolve) => setImmediate(resolve));
  first.input.value = '家里可好？';
  first.form.submit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2);
  assert.equal(first.log.children.length, 3);
  assert.equal(chooseSmithStory(save, 'bellows'), true);
  const reopened = host();
  mountNpcChat(reopened, save, person);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2);
  assert.equal(reopened.log.children.length, 3);
});

test('说书接受较长正文，断网、空值与超限仅返回空结果', async () => {
  const story = {
    ...input,
    mode: 'tea-story',
    npcId: 'tea',
    message: TEA_STORY_SETTINGS.requestMessage,
  };
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

test('听书临时失败后有限重试同一请求，成功后立即停止', async () => {
  const story = {
    ...input,
    mode: 'tea-story',
    npcId: 'tea',
    message: TEA_STORY_SETTINGS.requestMessage,
  };
  const signals: AbortSignal[] = [];
  const before = JSON.stringify(story);
  let calls = 0;
  const reply = await requestNpcDialogue(
    story,
    new AbortController().signal,
    async (_url, options) => {
      calls++;
      signals.push(options.signal);
      assert.equal(options.body, before);
      if (calls === 1) throw new TypeError('network unavailable');
      return Response.json({ reply: '风雪过后，山门重开。' });
    },
  );
  assert.equal(reply, '风雪过后，山门重开。');
  assert.equal(calls, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(JSON.stringify(story), before);
});

test('听书关闭取消不重试，限流和无效请求不自动反复发送', async () => {
  const story = {
    ...input,
    mode: 'tea-story',
    npcId: 'tea',
    message: TEA_STORY_SETTINGS.requestMessage,
  };
  for (const status of [400, 403, 429]) {
    let calls = 0;
    assert.equal(
      await requestNpcDialogue(story, new AbortController().signal, async () => {
        calls++;
        return Response.json({ error: status === 429 ? 'busy' : 'invalid-dialogue' }, { status });
      }),
      null,
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  const controller = new AbortController();
  const pending = requestNpcDialogue(story, controller.signal, async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  });
  controller.abort();
  assert.equal(await pending, null);
  assert.equal(calls, 1);
});

test('听书单次超时后使用新信号重试，连续失败最多尝试两次', async () => {
  const story = {
    ...input,
    mode: 'tea-story',
    npcId: 'tea',
    message: TEA_STORY_SETTINGS.requestMessage,
  };
  const signals: AbortSignal[] = [];
  const reply = await requestNpcDialogue(
    story,
    new AbortController().signal,
    async (_url, options) => {
      signals.push(options.signal);
      if (signals.length === 1)
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(new Error('timeout'))),
        );
      return Response.json({ reply: '这一回终于讲完。' });
    },
    10,
  );
  assert.equal(reply, '这一回终于讲完。');
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  let calls = 0;
  assert.equal(
    await requestNpcDialogue(story, new AbortController().signal, async () => {
      calls++;
      return Response.json({ error: 'inference-timeout', retryable: true }, { status: 504 });
    }),
    null,
  );
  assert.equal(calls, 2);
});

test('故事配图只接受有限图片响应，失败与取消不影响正文', async () => {
  const signal = new AbortController().signal;
  const token = `1234567890.${'a'.repeat(64)}`;
  const bytes = new Uint8Array([255, 216, 255, 217]);
  const image = await requestTeaStoryImage(' 一回旧闻 ', token, signal, async (url, options) => {
    assert.equal(url, `${NPC_AI_BASE}/story-image`);
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(JSON.parse(options.body), { story: '一回旧闻', token });
    return new Response(bytes, {
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(bytes.length) },
    });
  });
  assert.equal(image?.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await image!.arrayBuffer()), bytes);
  for (const response of [
    Response.json({ error: 'unavailable' }, { status: 503 }),
    new Response('not image', { headers: { 'Content-Type': 'text/plain' } }),
    new Response(null, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '6000000' } }),
    new Response(null, { headers: { 'Content-Type': 'image/jpeg' } }),
  ])
    assert.equal(await requestTeaStoryImage('旧闻', token, signal, async () => response), null);
  let fetched = false;
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(
    await requestTeaStoryImage('旧闻', token, aborted.signal, async () => {
      fetched = true;
      return new Response(bytes);
    }),
    null,
  );
  assert.equal(fetched, false);
});

function storyHost() {
  const nodes = Object.fromEntries(
    ['text', 'status', 'play', 'stop', 'retry', 'next', 'image-status'].map((name) => [
      `.tea-story-${name}`,
      {
        textContent: '',
        hidden: true,
        disabled: name === 'stop',
        addEventListener() {},
        setAttribute(name, value) {
          this[name] = value;
        },
      },
    ]),
  );
  const attributes = new Map();
  const styles = new Map();
  const classes = new Set();
  return {
    isConnected: true,
    querySelector: (selector: string) => nodes[selector],
    setAttribute: (name, value) => attributes.set(name, value),
    style: {
      setProperty: (name, value) => styles.set(name, value),
      removeProperty: (name) => styles.delete(name),
    },
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    attributes,
    styles,
    classes,
    nodes,
  };
}

test('听书失败明确提醒，手动重试不改存档，成功后才能再听一回', async (t) => {
  const save = freshSave();
  save.mortal.population = input.population;
  const before = JSON.stringify(save);
  const host = storyHost();
  let calls = 0;
  t.after(closeNpcChat);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return calls <= 2
      ? Response.json({ error: 'inference-timeout', retryable: true }, { status: 504 })
      : Response.json({ reply: '雪尽春来，道心未改。' });
  });
  await mountTeaStory(host, save, () => assert.fail('不能自动开声'));
  assert.equal(calls, 2);
  assert.match(
    host.nodes['.tea-story-status'].textContent,
    /故事生成失败.*AI 生成超时.*不会再次消耗年岁/,
  );
  assert.equal(host.nodes['.tea-story-status'].role, 'alert');
  assert.equal(host.nodes['.tea-story-next'].disabled, true);
  assert.equal(host.nodes['.tea-story-retry'].hidden, false);
  host.nodes['.tea-story-retry'].onclick();
  assert.equal(host.nodes['.tea-story-retry'].disabled, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 3);
  assert.equal(host.nodes['.tea-story-text'].textContent, '雪尽春来，道心未改。');
  assert.equal(host.nodes['.tea-story-status'].role, 'status');
  assert.equal(host.nodes['.tea-story-next'].disabled, false);
  assert.equal(host.nodes['.tea-story-retry'].hidden, true);
  assert.equal(JSON.stringify(save), before);
});

test('自动重试等待期间关闭立即取消，不发第二次请求也不弹失败提醒', async (t) => {
  const save = freshSave();
  save.mortal.population = input.population;
  const host = storyHost();
  let calls = 0;
  t.after(closeNpcChat);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: 'inference-failed', retryable: true }, { status: 503 });
  });
  const pending = mountTeaStory(host, save, () => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(host.nodes['.tea-story-status'].textContent, /正在自动重试（2\/2）/);
  closeNpcChat();
  await pending;
  assert.equal(calls, 1);
  assert.doesNotMatch(host.nodes['.tea-story-status'].textContent, /故事生成失败/);
});

test('配图失败明确提示但保留正文、朗读和下一回入口', async (t) => {
  const save = freshSave();
  save.mortal.population = input.population;
  const host = storyHost();
  t.after(closeNpcChat);
  t.mock.method(globalThis, 'fetch', async (url) =>
    String(url).endsWith('/chat')
      ? Response.json({
          reply: '一段已完整生成的故事。',
          imageToken: `1234567890.${'a'.repeat(64)}`,
        })
      : Response.json({ error: 'inference-failed' }, { status: 503 }),
  );
  await mountTeaStory(host, save, () => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(host.nodes['.tea-story-text'].textContent, '一段已完整生成的故事。');
  assert.match(host.nodes['.tea-story-image-status'].textContent, /配图暂未生成，不影响阅读和朗读/);
  assert.equal(host.nodes['.tea-story-next'].disabled, false);
});

test('故事正文不等待配图，关闭会取消图片请求，成功后才显示背景', async (t) => {
  const save = freshSave();
  save.mortal.population = input.population;
  const snapshot = JSON.stringify(save);
  const imageBytes = new Uint8Array([255, 216, 255, 217]);
  let imageRequest = 0;
  let resolveFirstImage;
  let firstImageSignal;
  t.mock.method(URL, 'createObjectURL', () => 'blob:story-image');
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/chat'))
      return Response.json({
        reply: '正文已经落定。',
        imageToken: `1234567890.${'a'.repeat(64)}`,
      });
    imageRequest++;
    if (imageRequest === 1) {
      firstImageSignal = options.signal;
      return new Promise((resolve) => {
        resolveFirstImage = resolve;
      });
    }
    return new Response(imageBytes, { headers: { 'Content-Type': 'image/jpeg' } });
  });

  const pendingHost = storyHost();
  await mountTeaStory(pendingHost, save, () => assert.fail('不能自动开启声音'));
  assert.equal(pendingHost.nodes['.tea-story-text'].textContent, '正文已经落定。');
  assert.equal(pendingHost.attributes.get('aria-busy'), 'false');
  assert.equal(pendingHost.classList.contains('has-story-image'), false);
  closeNpcChat();
  assert.equal(firstImageSignal.aborted, true);
  resolveFirstImage(new Response(imageBytes, { headers: { 'Content-Type': 'image/jpeg' } }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingHost.classList.contains('has-story-image'), false);

  const illustrated = storyHost();
  await mountTeaStory(illustrated, save, () => assert.fail('不能自动开启声音'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(illustrated.nodes['.tea-story-text'].textContent, '正文已经落定。');
  assert.equal(illustrated.classList.contains('has-story-image'), true);
  assert.equal(illustrated.styles.get('--tea-story-image'), 'url("blob:story-image")');
  closeNpcChat();
  assert.equal(revoke.mock.callCount(), 1);
  assert.equal(JSON.stringify(save), snapshot);
});

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
  assert.match(offline.nodes['.tea-story-status'].textContent, /故事生成失败.*网络连接失败/);
  assert.equal(offline.nodes['.tea-story-retry'].hidden, false);
  assert.equal(offline.nodes['.tea-story-next'].disabled, true);
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
