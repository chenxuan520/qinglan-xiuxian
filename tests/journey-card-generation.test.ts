import { ACHIEVEMENT_SCORES, journeyScore } from '../src/journey-score.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyCard } from '../src/journey-card.ts';
import { freshSave, IMMORTAL_CULTIVATION } from '../src/progress.ts';
import { TREASURES } from '../src/data.ts';
import { CURIO_IDS } from '../src/curio-data.ts';
import { SECTS } from '../src/mortal-data.ts';

// 只替换平台图片与编码能力，验证失败、取消及资源释放；画面由正常浏览器入口另验。
function platform(
  t: test.TestContext,
  options: {
    load?: (image: any, src: string) => void;
    encode?: (callback: BlobCallback) => void;
  } = {},
) {
  const images: any[] = [];
  const texts: Array<{
    value: string;
    x: number;
    y: number;
    color: string;
    font: string;
    shadow: number;
    width: number;
  }> = [];
  const states: Record<string, any>[] = [];
  const measureText = (value: string, font: string) => {
    const size = Number(font.match(/([\d.]+)px/)?.[1] ?? 10);
    return Array.from(value).reduce(
      (width, char) => width + size * (char.charCodeAt(0) > 255 ? 1 : 0.56),
      0,
    );
  };
  const context = new Proxy<Record<string, any>>(
    { font: '10px sans-serif', fillStyle: '#000000', shadowBlur: 0 },
    {
      get(target, key: string) {
        if (key in target) return target[key];
        if (key === 'fillText')
          return (value: string, x: number, y: number) =>
            texts.push({
              value,
              x,
              y,
              color: target.fillStyle,
              font: target.font,
              shadow: target.shadowBlur,
              width: measureText(value, target.font),
            });
        if (key === 'measureText')
          return (value: string) => ({ width: measureText(value, target.font) });
        if (key === 'save') return () => states.push({ ...target });
        if (key === 'restore')
          return () => {
            const state = states.pop()!;
            for (const name of Object.keys(target)) delete target[name];
            Object.assign(target, state);
          };
        if (key.startsWith('create')) return () => ({ addColorStop() {} });
        return () => {};
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => assert.fail('不能恢复base64逐字节转换'),
    toBlob: (callback: BlobCallback) =>
      options.encode
        ? options.encode(callback)
        : queueMicrotask(() => callback(new Blob(['png-bytes'], { type: 'image/png' }))),
  };
  for (const [name, value] of Object.entries({
    Image: class {
      naturalWidth = 1254;
      naturalHeight = 1254;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      source = '';
      constructor() {
        images.push(this);
      }
      set src(value: string) {
        this.source = value;
        if (value)
          queueMicrotask(() => (options.load ? options.load(this, value) : this.onload?.()));
      }
      get src() {
        return this.source;
      }
    },
    document: { createElement: () => canvas },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() =>
      previous
        ? Object.defineProperty(globalThis, name, previous)
        : Reflect.deleteProperty(globalThis, name),
    );
  }
  return { canvas, images, texts };
}

test('仅极限模式在留影右上绘入金色一命问道印记，适用于所有结局且不改存档', async (t) => {
  const p = platform(t);
  for (const lifeMode of ['normal', 'extreme'] as const) {
    const save = freshSave();
    save.lifeMode = lifeMode;
    const before = JSON.stringify(save);
    for (const ending of [
      'ongoing',
      'lifespan',
      'tribulation',
      'ambush',
      'extreme',
      'immortal',
    ] as const) {
      p.texts.length = 0;
      await createJourneyCard(save, ending);
      const seal = p.texts.filter(
        (text) => text.x > 750 && text.y < 220 && ['一命', '问道'].includes(text.value),
      );
      assert.equal(seal.length, lifeMode === 'extreme' ? 2 : 0, `${lifeMode}/${ending}`);
      assert.ok(seal.every((text) => text.color === '#efd48a'));
      assert.equal(JSON.stringify(save), before);
    }
  }
});

test('PNG直接返回Blob，成功及编码失败均释放Canvas像素', async (t) => {
  const p = platform(t);
  const blob = await createJourneyCard(freshSave());
  assert.equal(blob.type, 'image/png');
  assert.equal(await blob.text(), 'png-bytes');
  assert.equal(p.canvas.width, 0);
  assert.equal(p.canvas.height, 0);
  p.canvas.toBlob = (callback) => callback(null);
  await assert.rejects(createJourneyCard(freshSave()), /编码未完成/);
  assert.equal(p.canvas.width, 0);
  assert.equal(p.canvas.height, 0);
});

test('关闭时立即终止等待编码并清零，迟到回调不恢复Canvas', async (t) => {
  let ready!: () => void;
  const encoded = new Promise<void>((r) => {
    ready = r;
  });
  let late!: BlobCallback;
  const p = platform(t, {
    encode(callback) {
      late = callback;
      ready();
    },
  });
  const controller = new AbortController();
  const pending = createJourneyCard(freshSave(), undefined, controller.signal);
  await encoded;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(p.canvas.width, 0);
  assert.equal(p.canvas.height, 0);
  late(new Blob(['late']));
  assert.equal(p.canvas.width, 0);
});

test('单张素材短暂失败只重试一次，失败重试成功保留其余加载结果', async (t) => {
  let attempts = 0;
  const p = platform(t, {
    load(image, src) {
      if (src.includes('prologue') && ++attempts === 1) image.onerror?.();
      else image.onload?.();
    },
  });
  assert.ok((await createJourneyCard(freshSave())).size > 0);
  assert.equal(attempts, 2);
  assert.equal(p.images.length, 4);
});

test('素材两次失败取消其他图片；主动关闭不继续重试', async (t) => {
  const p = platform(t, {
    load(image, src) {
      if (src.includes('prologue')) image.onerror?.();
    },
  });
  await assert.rejects(createJourneyCard(freshSave()), /素材加载失败/);
  assert.equal(p.images.length, 4);
  assert.ok(p.images.every((image) => image.src === '' && !image.onload && !image.onerror));
  const controller = new AbortController();
  const pending = createJourneyCard(freshSave(), undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(p.images.length, 7);
  assert.ok(p.images.every((image) => image.src === ''));
});

test('真实绘制的道果行包含同一评分函数的分数、品第与称号', async (t) => {
  const p = platform(t);
  for (const lifeMode of ['normal', 'extreme'] as const) {
    const save = freshSave();
    save.lifeMode = lifeMode;
    const score = journeyScore(save);
    p.texts.length = 0;
    await createJourneyCard(save, 'ongoing');
    const label = p.texts
      .filter((text) => text.y === 1092)
      .map((text) => text.value)
      .join('');
    assert.ok(label.startsWith(`此世道果 ${score.total}（${score.grade}·${score.tier}）`));
  }
});

test('八档留影道果分色并突出数字，完整居中且字重与柔光不影响其他文字', async (t) => {
  const p = platform(t);
  const colors = new Map([
    ['下品', '#a8b6ae'],
    ['中下品', '#b8d0c7'],
    ['中品', '#83c7b0'],
    ['中上品', '#69d6b0'],
    ['上品', '#d8c998'],
    ['极品', '#f2d37a'],
    ['仙品', '#d6c6f2'],
    ['帝品', '#f4ad6b'],
  ]);
  const save = freshSave('none', []);
  save.lifeMode = 'extreme';
  save.cultivation = IMMORTAL_CULTIVATION;
  save.completed = [0, 1, 2, 3, 4, 5, 6];
  save.training = { vitality: 20, power: 20, speed: 20 };
  save.forge = Object.fromEntries(TREASURES.map((item) => [item.id, 10]));
  save.artifacts = TREASURES.map((item) => item.id);
  save.curios.bag = Object.fromEntries(CURIO_IDS.map((id) => [id, 1]));
  save.curios.acquired = [...CURIO_IDS];
  save.medicine.used.peiying = 3;
  save.mortal.member = { id: 'guard', dues: 0, dueAt: 0 };
  save.mortal.mastery = Object.fromEntries(SECTS.map((item) => [item.id, 10]));
  save.tribulations = 5;
  save.chronicle.milestones = Object.fromEntries(
    Object.keys(ACHIEVEMENT_SCORES).map((id) => [id, 15]),
  );
  const seen = new Set<string>();
  for (let count = 0; count <= 130 && seen.size < colors.size; count++) {
    save.adUsage.supplies = count;
    const score = journeyScore(save);
    if (seen.has(score.grade)) continue;
    seen.add(score.grade);
    const before = JSON.stringify(save);
    for (const ending of ['ongoing', 'immortal'] as const) {
      p.texts.length = 0;
      await createJourneyCard(save, ending);
      const label = p.texts.filter((text) => text.y === 1092);
      assert.equal(
        label.map((text) => text.value).join(''),
        `此世道果 ${score.total}（${score.grade}·${score.tier}）`,
      );
      assert.equal(label.length, 3);
      assert.ok(label.every((text) => text.color === colors.get(score.grade)));
      assert.deepEqual(
        label.map((text) => text.font.split(' ')[0]),
        ['600', '700', '600'],
      );
      assert.equal(label[1].value, String(score.total));
      const right = label.at(-1)!.x + label.at(-1)!.width;
      assert.ok(label[0].x >= 100 && right <= 980);
      assert.ok(Math.abs(label[0].x + right - 1080) < 0.001);
      assert.ok(label.every((text) => text.shadow === (score.grade === '帝品' ? 6 : 0)));
      const heading = p.texts.find((text) => text.value === '此 世 留 痕')!;
      assert.equal(heading.color, '#d8c998');
      assert.match(heading.font, /^400 28px/);
      assert.equal(heading.shadow, 0);
      assert.equal(JSON.stringify(save), before);
    }
  }
  assert.equal(seen.size, colors.size);
});
