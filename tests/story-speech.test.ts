import test from 'node:test';
import assert from 'node:assert/strict';
import { StorySpeech } from '../src/story-speech.ts';

test('浏览器中文朗读需主动播放，复用音量，停止与旧事件不会干扰下一次，缺少语音可降级', (t) => {
  const oldSynth = globalThis.speechSynthesis;
  const oldUtterance = globalThis.SpeechSynthesisUtterance;
  t.after(() => {
    if (oldSynth === undefined) delete globalThis.speechSynthesis;
    else globalThis.speechSynthesis = oldSynth;
    if (oldUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = oldUtterance;
  });
  let voices = [{ lang: 'en-US' }, { lang: 'zh-CN', localService: true }];
  const spoken = [];
  let cancels = 0;
  globalThis.speechSynthesis = {
    getVoices: () => voices,
    speak: (utterance) => spoken.push(utterance),
    cancel: () => cancels++,
  };
  globalThis.SpeechSynthesisUtterance = class {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  };
  const states = [];
  const speech = new StorySpeech((state) => states.push(state));
  assert.equal(spoken.length, 0);
  speech.play('一回旧闻', 0.35);
  assert.equal(spoken[0].lang, 'zh-CN');
  assert.equal(spoken[0].volume, 0.35);
  assert.equal(spoken[0].text, '一回旧闻');
  speech.stop();
  assert.equal(cancels, 1);
  speech.play('下一回旧闻', 0.6);
  spoken[0].onend();
  assert.equal(states.at(-1), 'speaking');
  spoken[1].onerror();
  assert.equal(states.at(-1), 'unavailable');
  voices = [{ lang: 'en-US' }];
  speech.play('无法朗读', 0.6);
  assert.equal(spoken.length, 2);
  assert.equal(states.at(-1), 'unavailable');
  delete globalThis.speechSynthesis;
  assert.equal(speech.supported, false);
  speech.play('文字仍在', 0.6);
  assert.equal(states.at(-1), 'unavailable');
});
