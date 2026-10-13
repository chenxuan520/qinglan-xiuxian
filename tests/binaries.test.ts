import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  binaryBreaches,
  commitBinaryBreaches,
  isBinary,
  PUBLIC_FONT_CSS,
} from '../scripts/check-binaries.ts';

const original = Buffer.from([0, 1, 2]);
const approval = (data: Buffer) => ({
  bytes: data.length,
  sha256: createHash('sha256').update(data).digest('hex'),
});

function repository(withLegacyCommit = false) {
  const cwd = mkdtempSync(join(tmpdir(), 'qinglan-binary-gate-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
  git('init');
  git('config', 'user.name', 'gate-test');
  git('config', 'user.email', 'gate-test@example.invalid');
  const write = (path: string, data: string | Buffer) => writeFileSync(join(cwd, path), data);
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'test change');
    return git('rev-parse', 'HEAD');
  };
  let legacy = '';
  if (withLegacyCommit) {
    write('legacy.md', '门禁建立前的既有历史');
    legacy = commit();
  }
  mkdirSync(join(cwd, 'scripts'));
  const approved = { 'approved.bin': approval(original) };
  write('approved.bin', original);
  write('scripts/approved-binaries.json', JSON.stringify(approved));
  const before = commit();
  const check = (eventName = 'push', missingBase = false) => {
    const after = git('rev-parse', 'HEAD'),
      base = missingBase ? '1'.repeat(40) : before;
    return commitBinaryBreaches(
      cwd,
      approved,
      eventName,
      eventName === 'pull_request'
        ? { pull_request: { base: { sha: base }, head: { sha: after } } }
        : { before: base, after },
    );
  };
  return { cwd, git, approved, write, commit, check, legacy };
}

test('中文源代码可提交；NUL、非UTF8、ASCII PDF和伪装成文本的素材扩展被识别', () => {
  assert.equal(isBinary(Buffer.from('中文界面与 TypeScript 源代码\n')), false);
  assert.equal(isBinary(Buffer.from([0, 1, 2])), true);
  assert.equal(isBinary(Buffer.from([255, 255])), true);
  assert.equal(isBinary(Buffer.from('%PDF-1.4\n%%EOF')), true);
  assert.equal(isBinary(Buffer.from('ascii'), 'asset.woff2'), true);
  assert.equal(isBinary(Buffer.from('ascii'), 'archive.zip'), true);
});

test('文件树检查拒绝新增素材和替换素材，不把删除视为新增', () => {
  const files = [
    { path: 'approved.bin', data: original },
    { path: 'new-picture.webp', data: original },
  ];
  const approved = { ['approved.bin']: approval(original) };
  assert.ok(
    binaryBreaches(files, approved).some(
      (x) => x.includes('禁止新增') && x.includes('new-picture'),
    ),
  );
  assert.ok(
    binaryBreaches([{ path: 'approved.bin', data: Buffer.from([0, 9, 8]) }], approved).some((x) =>
      x.includes('被替换'),
    ),
  );
  assert.deepEqual(binaryBreaches([{ path: 'approved.bin', data: original }], approved), []);
});

test('禁止本地字体和未经批准的加载，批准公共源及系统回退正常通过', () => {
  for (const [path, text] of [
    ['public/extra.woff2', 'ascii'],
    ['src/style.css', '@font-face{font-family:test;src:url(extra.woff2)}'],
    ['src/style.css', '@import url("https://cdn.example.invalid/theme.css");'],
    ['src/example.ts', 'new FontFace("test", "url(https://cdn.example.invalid/font.woff2)");'],
    ['src/example.ts', 'document.fonts.add(font);'],
    ['index.html', '<link href="https://fonts.googleapis.com/css2?family=Test">'],
    ['index.html', '<link href="https://cdn.example.invalid/theme.css" rel="stylesheet">'],
    ['index.html', `<link href="${PUBLIC_FONT_CSS}&text=other" rel="stylesheet">`],
    ['index.html', '<link rel="preload" as="font" href="https://cdn.example.invalid/font">'],
    ['public/extra.CSS', '@font-face{font-family:test;src:url(extra.woff2)}'],
    ['public/extra.HTML', '<link rel="stylesheet" href="https://cdn.example.invalid/theme.css">'],
    ['src/extra.TS', 'new FontFace("test", "url(extra.woff2)");'],
  ])
    assert.ok(binaryBreaches([{ path, data: Buffer.from(text) }], {}).length > 0, path);
  assert.deepEqual(
    binaryBreaches(
      [
        {
          path: 'index.html',
          data: Buffer.from(
            `<link rel="stylesheet" href="${PUBLIC_FONT_CSS}" media="print" onload="this.media='all'" onerror="this.remove()">`,
          ),
        },
      ],
      {},
    ),
    [],
  );
  assert.deepEqual(
    binaryBreaches(
      [
        { path: 'src/style.css', data: Buffer.from(':root{font-family:serif}') },
        { path: 'src/example.ts', data: Buffer.from('await document.fonts.ready;') },
      ],
      {},
    ),
    [],
  );
});

test('二进制加入后在后续提交删除，push与PR仍失败', () => {
  const r = repository();
  try {
    r.write('new.bin', original);
    r.commit();
    rmSync(join(r.cwd, 'new.bin'));
    r.commit();
    for (const event of ['push', 'pull_request'])
      assert.ok(r.check(event).some((x) => x.includes('new.bin')));
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('既有素材中间被替换后恢复，仍报告违规提交', () => {
  const r = repository();
  try {
    r.write('approved.bin', Buffer.from([0, 9, 8]));
    r.commit();
    r.write('approved.bin', original);
    r.commit();
    assert.ok(r.check().some((x) => x.includes('替换了已批准')));
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('旧基点侧支加入再删除二进制，合并后 push、PR 和未知基点仍拒绝', () => {
  const r = repository(true);
  try {
    const main = r.git('branch', '--show-current');
    r.git('checkout', '-b', 'old-base', r.legacy);
    r.write('temporary.bin', original);
    r.commit();
    rmSync(join(r.cwd, 'temporary.bin'));
    r.commit();
    r.git('checkout', main);
    r.git('merge', '--no-ff', 'old-base', '-m', 'merge side branch');
    for (const event of ['push', 'pull_request']) {
      assert.ok(r.check(event).some((x) => x.includes('temporary.bin')));
      assert.ok(r.check(event, true).some((x) => x.includes('temporary.bin')));
    }
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('旧基点纯文本侧支合并通过，不将未继承基线误报为删除', () => {
  const r = repository(true);
  try {
    const main = r.git('branch', '--show-current');
    r.git('checkout', '-b', 'old-base', r.legacy);
    r.write('note.md', '只添加文本。');
    r.commit();
    r.git('checkout', main);
    r.git('merge', '--no-ff', 'old-base', '-m', 'merge text side branch');
    assert.deepEqual(r.check(), []);
    assert.deepEqual(r.check('pull_request'), []);
    assert.deepEqual(r.check('push', true), []);
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('旧基点侧支写入损坏基线后删除，合并也不能绕过', () => {
  const r = repository(true);
  try {
    const main = r.git('branch', '--show-current');
    r.git('checkout', '-b', 'old-base', r.legacy);
    mkdirSync(join(r.cwd, 'scripts'));
    r.write('scripts/approved-binaries.json', 'not-json');
    r.commit();
    rmSync(join(r.cwd, 'scripts'), { recursive: true });
    r.commit();
    r.git('checkout', main);
    r.git('merge', '--no-ff', 'old-base', '-m', 'merge side branch');
    assert.ok(r.check().some((x) => x.includes('删除或损坏')));
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('修改白名单加入素材不会放行；当前白名单也必须与首次批准一致', () => {
  const r = repository();
  try {
    const extended = { ...r.approved, 'new.bin': approval(original) };
    r.write('scripts/approved-binaries.json', JSON.stringify(extended));
    r.write('new.bin', original);
    const after = r.commit();
    const breaches = commitBinaryBreaches(r.cwd, extended, 'push', { after });
    assert.ok(breaches.some((x) => x.includes('禁止修改')));
    assert.ok(breaches.some((x) => x.includes('new.bin')));
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('删除白名单时加入二进制、随后都恢复也无法绕过', () => {
  const r = repository();
  try {
    rmSync(join(r.cwd, 'scripts/approved-binaries.json'));
    r.write('new.bin', original);
    r.commit();
    r.write('scripts/approved-binaries.json', JSON.stringify(r.approved));
    rmSync(join(r.cwd, 'new.bin'));
    r.commit();
    const breaches = r.check();
    assert.ok(breaches.some((x) => x.includes('删除或损坏')));
    assert.ok(breaches.some((x) => x.includes('new.bin')));
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('未知比较范围仍扫描已启用门禁的所有提交，不能把强推当作豁免', () => {
  const r = repository();
  try {
    r.write('report.pdf', '%PDF-1.4\n%%EOF');
    r.commit();
    rmSync(join(r.cwd, 'report.pdf'));
    r.commit();
    assert.ok(r.check('push', true).some((x) => x.includes('report.pdf')));
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});

test('普通文本修改、批准素材原样恢复和删除素材均允许', () => {
  const r = repository();
  try {
    r.write('note.md', '只修改中文说明。');
    r.commit();
    rmSync(join(r.cwd, 'approved.bin'));
    r.commit();
    r.write('approved.bin', original);
    r.commit();
    assert.deepEqual(r.check(), []);
  } finally {
    rmSync(r.cwd, { recursive: true, force: true });
  }
});
