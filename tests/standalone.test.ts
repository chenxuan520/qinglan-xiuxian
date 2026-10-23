import test from 'node:test';
import assert from 'node:assert/strict';

// 单文件隔离进程：必须在首次导入任何游戏模块前模拟编译常量。
Object.defineProperty(globalThis, '__QINGLAN_STANDALONE__', { value: true });
const { STANDALONE } = await import('../src/build-mode.ts');
const { debugAccess } = await import('../src/debug-access.ts');
const { DebugEntry } = await import('../src/debug-entry.ts');
const { createTelemetry } = await import('../src/telemetry.ts');
const { NPC_AI_SETTINGS, TELEMETRY_SETTINGS } = await import('../src/setting.ts');
const { requestNpcDialogue, requestTeaStoryImage, mountTeaStory, closeNpcChat, NPC_AI_BASE } =
  await import('../src/npc-chat.ts');
const { resolveJourneyAppraisal, journeyAppraisalAiOrigin } = await import(
  '../src/journey-appraisal-ai.ts'
);
const { freshSave } = await import('../src/progress.ts');
const { journeyAppraisalFacts, localJourneyAppraisal } = await import(
  '../src/journey-appraisal.ts'
);
const { getAdProvider } = await import('../src/ads.ts');
const { adsenseProvider } = await import('../src/ads-adsense.ts');
const { guideContent } = await import('../src/guide.ts');
const input = {
  population: { seed: 12345, since: 15 },
  age: 15,
  npcId: 'smith' as const,
  realm: '炼气初期',
  message: '近来如何？',
  history: [],
};
let requests = 0;
const fetcher: typeof fetch = async () => {
  requests++;
  return Response.json({ enabled: true, reply: 'unexpected' });
};

test('单机常量关闭所有后端，即使在线且来源已获白名单授权', async () => {
  assert.equal(STANDALONE, true);
  assert.equal(NPC_AI_SETTINGS.baseUrl, '');
  assert.equal(NPC_AI_BASE, '');
  const signal = new AbortController().signal;
  assert.equal(await debugAccess('https://qinglan-npc-ai.011203.xyz', fetcher), 'disabled');
  assert.equal(await requestNpcDialogue(input, signal, fetcher), null);
  assert.equal(
    await requestTeaStoryImage('故事', `1234567890.${'a'.repeat(64)}`, signal, fetcher),
    null,
  );
  const facts = journeyAppraisalFacts(freshSave(), 'ongoing');
  for (const origin of [...TELEMETRY_SETTINGS.origins, 'http://localhost:5173']) {
    assert.equal(journeyAppraisalAiOrigin(origin), false);
    assert.deepEqual(
      await resolveJourneyAppraisal(facts, signal, { origin, online: true, fetcher }),
      localJourneyAppraisal(facts),
    );
  }
  assert.equal(requests, 0);
});

test('本地茶馆连续听书不联网、已取消请求不回正文', async () => {
  const stories = [];
  for (let i = 0; i < 6; i++) {
    const story = await requestNpcDialogue(
      { ...input, age: 15 + i / 2, mode: 'tea-story' },
      new AbortController().signal,
      fetcher,
    );
    assert.ok(story && story.length > 100 && story.length <= 900);
    stories.push(story);
    if (i) assert.notEqual(stories[i], stories[i - 1]);
  }
  const cancelled = new AbortController();
  cancelled.abort();
  assert.equal(
    await requestNpcDialogue({ ...input, mode: 'tea-story' }, cancelled.signal, fetcher),
    null,
  );
  assert.equal(requests, 0);
});

test('单机首回同样优先陆迟，展示后记录，随后三篇旧闻轮换且无网络', async (t) => {
  const { LU_CHI_TEA_STORY } = await import('../src/local-tea-stories.ts');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
    closeNpcChat();
  });
  t.mock.method(globalThis, 'fetch', async () => assert.fail('单机听书不能联网'));
  const save = freshSave();
  save.mortal.population = input.population;
  const displayed = [];
  for (let i = 0; i < 5; i++) {
    const nodes = new Map();
    const host = {
      isConnected: true,
      setAttribute() {},
      classList: { remove() {} },
      style: { removeProperty() {} },
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, { setAttribute() {} });
        return nodes.get(selector);
      },
    };
    await mountTeaStory(host, save, () => assert.fail('不自动开声'));
    displayed.push(nodes.get('.tea-story-text').textContent);
    save.age += 0.5;
  }
  assert.equal(displayed[0], LU_CHI_TEA_STORY);
  assert.equal(values.get('qinglan-tea-luchi-heard-v1'), '1');
  assert.ok(displayed.slice(1).every((story) => story !== LU_CHI_TEA_STORY));
  assert.equal(new Set(displayed.slice(1, 4)).size, 3);
  assert.equal(displayed[1], displayed[4]);
});

test('统计无法重新开启、不写匿名标识或偏好、手动flush不发送', () => {
  for (const origin of TELEMETRY_SETTINGS.origins) {
    let writes = 0,
      sends = 0;
    const tracker = createTelemetry({
      origin,
      endpoint: '/event',
      version: 'v1',
      storage: {
        getItem: () => null,
        setItem() {
          writes++;
        },
        removeItem() {
          writes++;
        },
      },
      send() {
        sends++;
      },
      createId() {
        throw Error('single player must not identify');
      },
    });
    tracker.setEnabled(true);
    assert.equal(tracker.active, false);
    assert.equal(tracker.enabled(), false);
    for (let i = 0; i < 30; i++) tracker.track({ type: 'session' });
    tracker.track({ type: 'error', detail: 'test' });
    tracker.track({ type: 'sharing', detail: 'image-save' });
    tracker.flush();
    tracker.setEnabled(false);
    assert.equal(tracker.pending(), 0);
    assert.equal(sends, 0);
    assert.equal(writes, 0);
  }
});

test('七连点不载入调试模块，广告供给不注入外部SDK', async () => {
  let loaded = 0;
  const entry = new DebugEntry({ canOpen: () => true }, async () => {
    loaded++;
    throw Error('must not load');
  });
  for (let i = 0; i < 20; i++) await entry.tap({ isConnected: true });
  assert.equal(loaded, 0);
  assert.equal(getAdProvider().name, 'placeholder');
  assert.equal(await adsenseProvider.prepare(), false);
});

test('单机帮助不承诺联网新故事或配图，保留本地留影说明', () => {
  const save = guideContent('save');
  const mortal = guideContent('mortal');
  assert.match(save, /单机版.*生成留影/);
  assert.doesNotMatch(save, /新故事与配图需要联网/);
  assert.match(mortal, /单机版讲述茶馆收录的旧闻/);
  assert.doesNotMatch(mortal, /可伴着画卷|连接失败时说书暂歇/);
});
