import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/progress.ts';
import { enterNextMarketBatch } from './market-fixture.ts';
import { MARKET_CULTIVATORS } from '../src/sect-market-data.ts';
import { marketOpportunity, chooseMarketOpportunity } from '../src/market-social.ts';
import { closeNpcChat, mountNpcChat, marketDialogueContext } from '../src/npc-chat.ts';
import { marketDialogueLocalReply } from '../src/npc-dialogue.ts';

function fixture(start: number) {
  for (let seed = start; seed < start + 1000; seed++) {
    const save = freshSave('heaven', ['metal'], 'orthodox', () => 0);
    save.age = 30;
    save.cultivation = 1;
    save.stones = 10000;
    save.prologueSeen = save.hometownSeen = true;
    save.mortal.hometown!.stage = 'departed';
    save.mortal.population = { seed, since: 15 };
    enterNextMarketBatch(save);
    const npc = MARKET_CULTIVATORS.find(({ id }) =>
      ['goods', 'deposit'].includes(marketOpportunity(save, id)?.kind ?? ''),
    );
    if (npc) return { save, npc };
  }
  throw Error('未找到可核验的真实机缘');
}

for (const status of [200, 503]) {
  test(`核验后旧闲谈返回${status}时，不再使用核验前结论`, async (t) => {
    const original = globalThis.document;
    const node = () => ({
      textContent: '',
      children: [] as any[],
      append(...children: any[]) {
        this.children.push(...children);
      },
    });
    globalThis.document = {
      createElement: node,
      createTextNode: (textContent: string) => ({ textContent }),
    } as any;
    t.after(() => {
      closeNpcChat();
      if (original) globalThis.document = original;
      else delete (globalThis as any).document;
    });
    const log = {
      ...node(),
      hidden: true,
      scrollHeight: 0,
      scrollTop: 0,
      replaceChildren() {
        this.children = [];
      },
      setAttribute() {},
    };
    const input = { value: '', disabled: false, focus() {} },
      button = { disabled: false },
      note = { textContent: '' };
    let submit!: (event: any) => void,
      release!: (response: Response) => void,
      sent: any,
      calls = 0;
    const form = {
      querySelector: (selector: string) => (selector === 'input' ? input : button),
      addEventListener(_event: string, fn: any) {
        submit = fn;
      },
    };
    const host = {
      isConnected: true,
      dataset: {},
      querySelector: (selector: string) =>
        ({ '.npc-chat-log': log, form, '.npc-chat-status': note })[selector],
    };
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
      calls++;
      if (calls === 1) return Response.json({ reply: '道友，今日坊中来往的人不少。' });
      sent = JSON.parse(options.body);
      return pending;
    });
    const { save, npc } = fixture(status);
    mountNpcChat(host as any, save, { ...npc, generation: 0 });
    for (let n = 0; n < 50 && button.disabled; n++)
      await new Promise((resolve) => setImmediate(resolve));
    assert.equal(button.disabled, false);
    input.value = '这桩机缘是否可信，核验过了吗？';
    submit({ preventDefault() {} });
    assert.equal(calls, 2);
    const old = marketDialogueLocalReply(sent);
    assert.match(old, /尚未核验/);
    assert.ok(chooseMarketOpportunity(save, npc.id, save.mortal.sectMarket!.visit, 'inspect'));
    const expected = marketDialogueLocalReply({
      ...sent,
      age: save.age,
      marketContext: marketDialogueContext(save, npc.id),
    });
    assert.notEqual(expected, old);
    release(
      status === 200
        ? Response.json({ reply: old })
        : Response.json({ error: 'unavailable' }, { status }),
    );
    for (let n = 0; n < 50 && button.disabled; n++)
      await new Promise((resolve) => setImmediate(resolve));
    assert.equal(button.disabled, false);
    const displayed = log.children
      .at(-1)
      .children.map((child: any) => child.textContent)
      .join('');
    assert.ok(displayed.includes(expected), displayed);
    assert.ok(!displayed.includes('尚未核验'));
    assert.equal(calls, 2, '丢弃迟到结论不额外发送新请求');
  });
}
