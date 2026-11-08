import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
test('源码、测试与脚本按领域归档，根层只保留指定入口', () => {
  const files = (dir: string) =>
    readdirSync(new URL(dir, root), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  assert.deepEqual(files('src/'), ['main.ts', 'vite-env.d.ts']);
  assert.deepEqual(
    files('tests/').filter((name) => name.endsWith('.ts')),
    [],
  );
  assert.deepEqual(files('scripts/'), []);
});
