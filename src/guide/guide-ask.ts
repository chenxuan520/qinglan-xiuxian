import styles from './guide-ask.css?inline';
import { requestGuideAnswer } from './guide-ask-client.ts';
import {
  GUIDE_ASK_FAILURE,
  GUIDE_ASK_BUSY,
  type GuideAskReply,
  type GuideAskMessage,
} from './guide-ask-contract.ts';

type Round = { question: string; reply?: GuideAskReply; error?: string };
// 本次页面的内存对话；不读写存档或浏览器存储。
const rounds: Round[] = [];

export function jumpGuideSource(source: NonNullable<GuideAskReply['source']>) {
  const panel = document.querySelector<HTMLElement>('.panel[data-panel="guide"]');
  const tab = [
    ...(panel?.querySelectorAll<HTMLButtonElement>('.guide-tabs [data-action="guide-tab"]') ?? []),
  ].find((button) => button.dataset.id === source.tab);
  if (!tab) return;
  tab.click();
  requestAnimationFrame(() => {
    const next = document.querySelector<HTMLElement>('.panel[data-panel="guide"]');
    if (!next) return;
    const heading = [...next.querySelectorAll<HTMLElement>('h3')].find(
      (node) => node.textContent?.replace(/\s+/g, ' ').trim() === source.heading,
    );
    if (!heading) {
      next.scrollTo(0, 0);
      return;
    }
    for (
      let node: HTMLElement | null = heading.parentElement;
      node && node !== next;
      node = node.parentElement
    )
      if (node instanceof HTMLDetailsElement) node.open = true;
    heading.scrollIntoView({ block: 'start' });
  });
}

export function mountGuideAsk(host: HTMLElement) {
  // 样式随同一个JS分块重试，避免首加载断网后只恢复逻辑、漏掉样式。
  if (!document.getElementById('guide-ask-styles')) {
    const style = document.createElement('style');
    style.id = 'guide-ask-styles';
    style.textContent = styles;
    document.head.append(style);
  }
  host.classList.add('guide-ask');
  host.innerHTML =
    '<button type="button" class="prologue-revisit guide-ask-toggle" aria-expanded="true">有不懂的？问一问</button><div class="guide-ask-body"><div class="guide-ask-log" role="log" aria-live="polite" aria-label="指南答疑"></div><div class="guide-ask-examples"><button type="button">丹药什么时候能吃？</button><button type="button">灵根有什么区别？</button><button type="button">进度怎么保存？</button></div><form class="guide-ask-form"><input type="text" aria-label="向指南提问" placeholder="比如：丹药怎么吃？怎么换设备继续玩？" maxlength="100" required autocomplete="off"><button type="submit" class="secondary-button">问</button></form><p class="guide-ask-disclaimer">答案由 AI 依据指南生成，可能有误，以指南原文为准。</p></div>';
  const toggle = host.querySelector<HTMLButtonElement>('.guide-ask-toggle')!;
  const body = host.querySelector<HTMLDivElement>('.guide-ask-body')!;
  const log = host.querySelector<HTMLDivElement>('.guide-ask-log')!;
  const form = host.querySelector<HTMLFormElement>('form')!;
  const input = host.querySelector<HTMLInputElement>('input')!;
  const send = form.querySelector<HTMLButtonElement>('button')!;
  const examples = [...host.querySelectorAll<HTMLButtonElement>('.guide-ask-examples button')];
  let controller: AbortController | undefined;
  let generation = 0;
  let expanded = true;
  let closed = false;

  const render = () => {
    log.replaceChildren();
    for (const round of rounds) {
      const question = document.createElement('p');
      question.className = 'guide-ask-question';
      question.textContent = round.question;
      log.append(question);
      if (round.reply || round.error) {
        const answer = document.createElement('div');
        answer.className = 'guide-ask-answer';
        const text = document.createElement('p');
        text.textContent = round.reply?.answer ?? round.error!;
        answer.append(text);
        if (round.reply?.source) {
          const source = round.reply.source;
          const link = document.createElement('button');
          link.type = 'button';
          link.className = 'prologue-revisit guide-ask-source';
          link.textContent = '去看这一节';
          link.addEventListener('click', () => jumpGuideSource(source));
          answer.append(link);
        }
        log.append(answer);
      }
    }
    log.scrollTop = log.scrollHeight;
  };
  const controls = (waiting: boolean) => {
    input.disabled = waiting;
    send.disabled = waiting;
    send.textContent = waiting ? '翻书中…' : '问';
    for (const example of examples) example.disabled = waiting;
    body.setAttribute('aria-busy', String(waiting));
  };
  const cancel = () => {
    generation++;
    controller?.abort();
    controller = undefined;
    const pending = rounds.findIndex((round) => !round.reply && !round.error);
    if (pending >= 0) rounds.splice(pending, 1);
    controls(false);
  };
  const ask = async (value: string) => {
    const question = value.trim();
    if (closed || controller || !question || question.length > 100) return;
    const request = ++generation;
    const history: GuideAskMessage[] = rounds
      .filter((round) => round.reply)
      .slice(-2)
      .flatMap((round) => [
        { role: 'user' as const, content: round.question },
        { role: 'assistant' as const, content: round.reply!.answer },
      ]);
    const round: Round = { question };
    rounds.push(round);
    if (rounds.length > 4) rounds.shift();
    controller = new AbortController();
    controls(true);
    input.value = '';
    render();
    try {
      const reply = await requestGuideAnswer(question, history, controller.signal);
      if (!closed && expanded && host.isConnected && request === generation) round.reply = reply;
    } catch (error) {
      if (!closed && expanded && host.isConnected && request === generation)
        round.error =
          error instanceof Error && error.message === GUIDE_ASK_BUSY
            ? GUIDE_ASK_BUSY
            : GUIDE_ASK_FAILURE;
    } finally {
      if (!closed && request === generation) {
        controller = undefined;
        controls(false);
        render();
      }
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void ask(input.value);
  });
  for (const example of examples)
    example.addEventListener('click', () => {
      void ask(example.textContent!);
    });
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    body.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    if (!expanded) cancel();
    else {
      render();
      input.focus({ preventScroll: true });
    }
  });
  render();
  input.focus({ preventScroll: true });
  return () => {
    closed = true;
    cancel();
  };
}
