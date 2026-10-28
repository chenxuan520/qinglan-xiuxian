import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyCard } from '../src/journey-card.ts';
import { freshSave } from '../src/progress.ts';

// 只替换平台图片与编码能力，验证失败、取消及资源释放；画面由正常浏览器入口另验。
function platform(
  t: test.TestContext,
  options: {
    load?: (image: any, src: string) => void;
    encode?: (callback: BlobCallback) => void;
  } = {},
) {
  const images: any[] = [];
  const texts: Array<{ value: string; x: number; y: number; color: string }> = [];
  const context = new Proxy<Record<string, any>>(
    {},
    {
      get(target, key: string) {
        if (key in target) return target[key];
        if (key === 'fillText')
          return (value: string, x: number, y: number) =>
            texts.push({ value, x, y, color: target.fillStyle });
        if (key === 'measureText') return (value: string) => ({ width: value.length * 26 });
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
