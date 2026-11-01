import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGuideAnswer, validGuideAskReply } from '../src/guide-ask-client.ts';
import { GUIDE_ASK_BUSY, GUIDE_ASK_FAILURE } from '../src/guide-ask-contract.ts';
import { guidePanel } from '../src/lobby-ui.ts';
import { GUIDE_TABS, guideContent } from '../src/guide.ts';

test('每个指南标签都有轻量入口，不预先渲染输入框和聊天', () => {
  for (const tab of GUIDE_TABS) {
    const html = guidePanel(tab.id, false, GUIDE_TABS, guideContent)[2];
    assert.match(html, /<\/div><qinglan-guide-ask><\/qinglan-guide-ask>/);
    assert.doesNotMatch(html, /guide-ask-form|向指南提问/);
  }
});

test('提问只传问题与最近四条历史，不带凭据/存档；响应来源必须是真实指南标题', async () => {
  let sent: RequestInit | undefined;
  const history = Array.from({ length: 8 }, (_, i) => ({
    role: 'user' as const,
    content: String(i),
  }));
  const result = await requestGuideAnswer(
    ' 丹药怎么吃 ',
    history,
    new AbortController().signal,
    async (url, init) => {
      assert.match(String(url), /\/guide-ask$/);
      sent = init;
      return Response.json({
        answer: '出发前服用。',
        source: { tab: 'medicine', heading: '行前一炉丹香' },
      });
    },
  );
  assert.equal(sent?.credentials, 'omit');
  assert.deepEqual(JSON.parse(String(sent?.body)), {
    question: '丹药怎么吃',
    history: history.slice(-4),
  });
  assert.equal(result.source?.tab, 'medicine');
  assert.equal(
    validGuideAskReply({ answer: 'ok', source: { tab: 'medicine', heading: '<script>' } }),
    false,
  );
  assert.equal(validGuideAskReply({ answer: '答'.repeat(301), source: null }), false);
  assert.equal(validGuideAskReply({ answer: '没找到', source: null }), true);
});

test('网络与超时统一提示，超时覆盖迟到响应体及忽略abort的fetcher；429保留固定频控提示', async () => {
  const signal = new AbortController().signal;
  const busy: typeof fetch = async () => Response.json({ message: 'arbitrary' }, { status: 429 });
  await assert.rejects(requestGuideAnswer('丹药', [], signal, busy), { message: GUIDE_ASK_BUSY });
  await assert.rejects(
    requestGuideAnswer('丹药', [], signal, async () => {
      throw Error('private');
    }),
    { message: GUIDE_ASK_FAILURE },
  );
  await assert.rejects(
    requestGuideAnswer('丹药', [], signal, async () => new Promise(() => {}), 15),
    { message: GUIDE_ASK_FAILURE },
  );
  const slowBody: typeof fetch = async () =>
    new Response(new ReadableStream({ start() {} }), {
      headers: { 'Content-Type': 'application/json' },
    });
  await assert.rejects(requestGuideAnswer('丹药', [], signal, slowBody, 15), {
    message: GUIDE_ASK_FAILURE,
  });
  await assert.rejects(
    requestGuideAnswer('丹药', [], signal, async () =>
      Response.json({ answer: '<script>', source: { tab: 'x', heading: 'x' } }),
    ),
    { message: GUIDE_ASK_FAILURE },
  );
});

test('取消前不发请求，进行中取消终止等待，不把迟到结果作为回答', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ answer: 'ok', source: null });
  };
  await assert.rejects(requestGuideAnswer('丹药', [], controller.signal, fetcher));
  assert.equal(calls, 0);
  const pending = new AbortController();
  const result = requestGuideAnswer('丹药', [], pending.signal, async () => new Promise(() => {}));
  pending.abort();
  await assert.rejects(result, { message: GUIDE_ASK_FAILURE });
});
