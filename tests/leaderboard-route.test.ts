import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Cloudflare Routes匹配完整URL（含query）；Worker内部仍精确限制pathname。
test('官网排行榜路由必须同时覆盖公开读榜与带self查询，不能落到Pages HTML', () => {
  const config = JSON.parse(
    readFileSync(new URL('../workers/leaderboard/wrangler.jsonc', import.meta.url), 'utf8').replace(
      /,\s*([}\]])/g,
      '$1',
    ),
  );
  const route = config.routes.find((r: { pattern: string }) =>
    r.pattern.startsWith('xiuxian.011203.xyz/api/leaderboard'),
  );
  assert.ok(route);
  const pattern = new RegExp(
    '^' +
      route.pattern
        .split('*')
        .map((s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  );
  for (const suffix of ['', '?self=1'])
    assert.equal(pattern.test('xiuxian.011203.xyz/api/leaderboard' + suffix), true, suffix);
});
