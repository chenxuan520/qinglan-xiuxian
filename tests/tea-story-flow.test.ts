import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { createContext, Script } from 'node:vm';
import { AD_SUPPLIES, FINAL_TRIAL_STAGE, MAX_REVIVES } from '../src/data.ts';
import { freshSave, lifespanInfo, realmInfo, SAVE_KEY, tribulationDue } from '../src/progress.ts';
import { departHometown, acceptHometownRoot } from '../src/hometown.ts';
import { syncHumanStories } from '../src/human-stories.ts';
import { startActivity, resolveActivity, sectDuesPending, settleSectDues } from '../src/mortal.ts';
import { TEA_STORY_SETTINGS } from '../src/setting.ts';

// 不启动 main 的页面初始化；路由、结算、重试 onclick 和关闭清理均执行源码。
const flow = new Script(
  stripTypeScriptTypes(
    [
      [
        'main',
        [
          'showTeaStory',
          'handleAction',
          'syncMortalChange',
          'persist',
          'renderMortal',
          'renderLifespanEnd',
          'renderTribulationPending',
          'renderSectDues',
        ],
      ],
      ['npc-chat', ['mountTeaStory', 'closeNpcChat', 'clearStoryImage', 'dialogueErrorMessage']],
    ]
      .flatMap(([file, names]) => {
        const source = readFileSync(new URL(`../src/${file}.ts`, import.meta.url), 'utf8');
        return (names as string[]).map((name) => {
          const match = source.match(
            new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^\\}`, 'm'),
          );
          assert.ok(match, `未找到 ${file}.ts 实际函数 ${name}`);
          return match[0].replace(/^export /, '');
        });
      })
      .join('\n'),
  ),
);

type Reply = { reply: string } | { error: string; retryable: boolean };

function harness(t: TestContext) {
  const save = freshSave();
  departHometown(save);
  acceptHometownRoot(save);
  const noop = () => {};
  const node = (attributes = '') => {
    const attrs = Object.fromEntries(
      [...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']),
    );
    return {
      disabled: Object.hasOwn(attrs, 'disabled'),
      hidden: Object.hasOwn(attrs, 'hidden'),
      textContent: '',
      onclick: null as (() => void) | null,
      focus: noop,
      remove: noop,
      setAttribute: (name: string, value: string) => (attrs[name] = value),
      getAttribute: (name: string) => attrs[name] ?? null,
      classList: { add: noop, remove: noop, toggle: noop },
      style: { setProperty: noop, removeProperty: noop },
    };
  };
  let html = '';
  let host:
    | (ReturnType<typeof node> & { isConnected: boolean; querySelector: typeof query })
    | null = null;
  let nodes = new Map<string, ReturnType<typeof node>>();
  const query = (selector: string) => nodes.get(selector) ?? null;
  const modal = {
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      if (host) host.isConnected = false;
      host = null;
      nodes = new Map();
      const story = value.match(/<section class="tea-story"[^>]*>([^]*?)<\/section>/);
      if (!story) return;
      for (const [, attributes] of story[1].matchAll(/<(?:button|p|div)\b([^>]*)>/g)) {
        const element = node(attributes);
        for (const name of (element.getAttribute('class') ?? '').split(/\s+/))
          nodes.set(`.${name}`, element);
      }
      host = { ...node(), isConnected: true, querySelector: query };
    },
    querySelector: (selector: string) => (selector === '.tea-story' ? host : query(selector)),
  };
  const requests: { age: number; signal: AbortSignal; resolve: (reply: Reply) => void }[] = [];
  const rolls: number[] = [];
  const randomValues: number[] = [];
  t.mock.method(Math, 'random', () => {
    const value = randomValues.shift() ?? 0.9;
    rolls.push(value);
    return value;
  });
  const writes: string[] = [];
  const messages: string[] = [];
  const context = createContext({
    save,
    modal,
    writes,
    messages,
    requests,
    rolls,
    randomValues,
    startActivity,
    resolveActivity,
    sectDuesPending,
    settleSectDues,
    syncHumanStories,
    lifespanInfo,
    realmInfo,
    tribulationDue,
    AD_SUPPLIES,
    FINAL_TRIAL_STAGE,
    MAX_REVIVES,
    SAVE_KEY,
    TEA_STORY_SETTINGS,
    AbortController,
    game: null,
    pendingRun: null,
    panel: 'town-event',
    inTown: true,
    inMortalWorld: true,
    assetsReady: true,
    storageAvailable: true,
    activeRequest: null,
    activeSpeech: null,
    activeStoryImageUrl: '',
    ui: { innerHTML: '', scrollTop: 0 },
    document: { body: node() },
    localStorage: {
      setItem(key: string, value: string) {
        assert.equal(key, SAVE_KEY);
        writes.push(value);
      },
    },
    toast: (message: string) => messages.push(message),
    panelFrame: (title: string, subtitle: string, body: string) => {
      modal.innerHTML = `${title}${subtitle}${body}`;
    },
    clearInput: noop,
    releaseTownScene: noop,
    mountTownScene: noop,
    townPage: () => '',
    fullscreenButton: () => '',
    // 请求结果可控，成功/失败后的按钮切换与本地重试不作桩。
    requestNpcDialogueResponse: (input: { age: number }, signal: AbortSignal) =>
      new Promise<Reply>((resolve) => requests.push({ age: input.age, signal, resolve })),
    StorySpeech: class {
      supported = true;
      stops = 0;
      stop() {
        this.stops++;
      }
    },
  });
  flow.runInContext(context);
  return {
    context,
    save,
    modal,
    requests,
    rolls,
    randomValues,
    writes,
    messages,
    async reply(result: Reply) {
      requests.at(-1)!.resolve(result);
      await setImmediate();
    },
  };
}

test('连续听书仅成功后可开下一回，每回半载且只判定一次，重建按钮防连点并保留街巷关闭', async (t) => {
  const h = harness(t);
  const { context: c, save, modal, requests, rolls, writes } = h;
  h.randomValues.push(0.299999, 0.9, 0.3, 0.9);
  const previousRequest = new AbortController();
  const previousSpeech = {
    stops: 0,
    stop() {
      this.stops++;
    },
  };
  c.activeRequest = previousRequest;
  c.activeSpeech = previousSpeech;
  c.handleAction('mortal-activity', 'tea');
  assert.equal(previousRequest.signal.aborted, true);
  assert.equal(previousSpeech.stops, 1);
  assert.equal(c.panel, 'tea-story');
  assert.equal(save.age, 15.5);
  assert.equal(save.stones, 8);
  assert.equal(save.mortal.activity, null);
  assert.deepEqual(rolls, [0.299999, 0.9]); // 灵石机缘一次，既有赠药判定一次。
  const firstHost = modal.querySelector('.tea-story')!;
  const firstNext = modal.querySelector('.tea-story-next')!;
  assert.equal(firstNext.getAttribute('data-action'), 'mortal-activity');
  assert.equal(firstNext.getAttribute('data-id'), 'tea');
  assert.equal(firstNext.getAttribute('disabled'), '');
  assert.equal(firstNext.disabled, true);
  assert.match(
    modal.innerHTML,
    /<section class="tea-story"[^]*data-action="close">回到街巷[^]*tea-story-next[^]*tea-story-retry[^]*<\/section>/,
  );
  const paid = JSON.stringify(save);
  for (let i = 0; i < 3; i++) c.handleAction('mortal-activity', 'tea');
  assert.equal(JSON.stringify(save), paid);
  assert.equal(requests.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(rolls.length, 2);

  await h.reply({ reply: '第一回旧事。' });
  assert.equal(firstNext.disabled, false);
  assert.equal(JSON.stringify(save), paid);
  for (const [action, id] of [
    ['mortal-activity', 'herbs'],
    ['mortal-activity', 'study'],
    ['mortal-buy', ''],
    ['mortal-tab', 'sects'],
  ])
    c.handleAction(action, id);
  assert.equal(JSON.stringify(save), paid);
  assert.equal(c.panel, 'tea-story');
  assert.equal(writes.length, 1);
  const firstSpeech = c.activeSpeech;
  c.handleAction(firstNext.getAttribute('data-action'), firstNext.getAttribute('data-id'));
  assert.equal(save.age, 16);
  assert.equal(save.mortal.years, 1);
  assert.equal(save.stones, 8); // 0.3 不中奖，不能因 syncMortalChange 再次结算。
  assert.equal(save.mortal.activity, null);
  assert.deepEqual(rolls, [0.299999, 0.9, 0.3, 0.9]);
  assert.equal(firstSpeech.stops, 1);
  assert.equal(firstHost.isConnected, false);
  assert.equal(c.panel, 'tea-story');
  const next = modal.querySelector('.tea-story-next')!;
  assert.notEqual(next, firstNext);
  assert.equal(next.getAttribute('disabled'), '');
  assert.equal(next.disabled, true);
  const secondPaid = JSON.stringify(save);
  for (let i = 0; i < 3; i++) c.handleAction('mortal-activity', 'tea');
  assert.equal(JSON.stringify(save), secondPaid);
  assert.deepEqual(
    requests.map((request) => request.age),
    [15.5, 16],
  );
  assert.equal(writes.length, 2);
  assert.deepEqual(JSON.parse(writes[1]), { ...save, activeRun: null });

  await h.reply({ reply: '第二回旧事。' });
  const secondSpeech = c.activeSpeech;
  c.handleAction('close');
  assert.equal(secondSpeech.stops, 1);
  assert.equal(c.panel, '');
  assert.equal(modal.innerHTML, '');
  assert.equal(c.inTown, true);
  assert.equal(c.inMortalWorld, true);
  assert.equal(JSON.stringify(save), secondPaid);
  assert.equal(writes.length, 2);
});

test('失败重试只重发本回请求，不带主路由 action，不重扣年岁或机缘；加载中关闭取消请求', async (t) => {
  const h = harness(t);
  const { context: c, save, modal, requests, rolls, writes } = h;
  c.handleAction('mortal-activity', 'tea');
  const paid = JSON.stringify(save);
  const host = modal.querySelector('.tea-story')!;
  const retry = modal.querySelector('.tea-story-retry')!;
  assert.equal(retry.hidden, true);
  assert.equal(retry.disabled, true);
  assert.equal(retry.getAttribute('data-action'), null);
  assert.equal(retry.getAttribute('data-id'), null);
  assert.equal(retry.getAttribute('mortal-action'), null);
  for (let attempt = 0; attempt < 2; attempt++) {
    await h.reply({ error: 'network', retryable: true });
    assert.equal(modal.querySelector('.tea-story-status')!.getAttribute('role'), 'alert');
    assert.match(
      modal.querySelector('.tea-story-status')!.textContent,
      /故事生成失败.*重试这一回.*不会再次消耗年岁或判定机缘/,
    );
    assert.equal(modal.querySelector('.tea-story-next')!.disabled, true);
    assert.equal(retry.hidden, false);
    assert.equal(retry.disabled, false);
    c.handleAction('mortal-activity', 'tea');
    retry.onclick!();
    retry.onclick!();
    assert.equal(retry.disabled, true);
    assert.equal(requests.length, attempt + 2);
    assert.equal(modal.querySelector('.tea-story'), host);
    assert.equal(JSON.stringify(save), paid);
    assert.equal(rolls.length, 2);
    assert.equal(writes.length, 1);
  }
  await h.reply({ reply: '重试后完整的这一回。' });
  assert.equal(modal.querySelector('.tea-story-next')!.disabled, false);
  assert.equal(JSON.stringify(save), paid);
  assert.deepEqual(
    requests.map((request) => request.age),
    [15.5, 15.5, 15.5],
  );
  c.handleAction('mortal-activity', 'tea');
  assert.equal(save.age, 16);
  assert.equal(rolls.length, 4);
  const secondPaid = JSON.stringify(save);
  c.handleAction('close');
  assert.equal(requests[3].signal.aborted, true);
  await h.reply({ reply: '关闭后才到达的故事。' });
  retry.onclick!();
  assert.equal(requests.length, 4);
  assert.equal(c.panel, '');
  assert.equal(modal.innerHTML, '');
  assert.equal(JSON.stringify(save), secondPaid);
  assert.equal(writes.length, 2);
});

test('下一回遇寿尽、天劫或供奉不足仍截停原活动并进入原面板，不抢先生成或发奖', async (t) => {
  for (const boundary of ['lifespan', 'tribulation', 'dues']) {
    const h = harness(t);
    const { context: c, save, modal, requests, rolls, writes } = h;
    c.showTeaStory();
    await h.reply({ reply: '上一回已读完。' });
    if (boundary === 'lifespan') save.age = lifespanInfo(save).limit - 0.25;
    else if (boundary === 'tribulation') {
      save.cultivation = 1e9;
      save.nextTribulationAge = 20000;
      save.age = 19999.75;
    } else save.mortal.member = { id: 'power', dueAt: 0.25, dues: 50 };
    const age = save.age;
    c.handleAction('mortal-activity', 'tea');
    assert.equal(save.age, age + 0.25, boundary);
    assert.equal(save.mortal.years, 0.25);
    assert.deepEqual(save.mortal.activity, {
      kind: 'tea',
      remaining: 0.25,
      total: 0.5,
      sect: null,
    });
    assert.equal(save.stones, 0);
    assert.equal(rolls.length, 0);
    assert.equal(requests.length, 1);
    assert.equal(
      c.panel,
      { lifespan: 'lifespan-ended', tribulation: 'tribulation-pending', dues: 'sect-dues' }[
        boundary
      ],
    );
    assert.match(
      modal.innerHTML,
      { lifespan: /寿元已尽/, tribulation: /天劫将至/, dues: /供奉到期/ }[boundary]!,
    );
    assert.deepEqual(JSON.parse(writes.at(-1)!), { ...save, activeRun: null });
    const paused = JSON.stringify(save);
    c.handleAction('mortal-activity', 'tea');
    assert.equal(JSON.stringify(save), paused);
    assert.equal(requests.length, 1);
    if (boundary === 'dues') {
      save.stones = 50;
      c.handleAction('dues-pay');
      assert.equal(save.age, age + 0.5);
      assert.equal(save.mortal.activity, null);
      assert.equal(save.stones, 0);
      assert.equal(rolls.length, 2);
      assert.equal(requests.length, 1);
      assert.equal(c.panel, '');
    }
  }
});

test('已有寿元、天劫、供奉或未完事项门禁不被下一回绕过，拒绝启动保留失败提示', async (t) => {
  for (const boundary of ['lifespan', 'tribulation', 'dues', 'activity']) {
    const h = harness(t);
    const { context: c, save, requests, rolls, writes, messages } = h;
    c.showTeaStory();
    await h.reply({ reply: '上一回已读完。' });
    if (boundary === 'lifespan') save.age = lifespanInfo(save).limit;
    else if (boundary === 'tribulation') save.nextTribulationAge = save.age;
    else if (boundary === 'dues') save.mortal.member = { id: 'power', dueAt: 0, dues: 50 };
    else save.mortal.activity = { kind: 'herbs', remaining: 0.25, total: 1, sect: null };
    const before = JSON.stringify(save);
    c.handleAction('mortal-activity', 'tea');
    assert.equal(JSON.stringify(save), before, boundary);
    assert.equal(requests.length, 1);
    assert.equal(rolls.length, 0);
    assert.equal(writes.length, 0);
    if (boundary === 'tribulation') assert.equal(c.panel, 'tribulation-pending');
    else {
      assert.equal(c.panel, 'tea-story');
      assert.match(messages.at(-1)!, /暂时不能继续听书.*寿元或未完成的事项/);
    }
  }
});
