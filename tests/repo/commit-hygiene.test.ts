import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCommits, docsOnly, docsSubject } from '../../scripts/repo/commit-hygiene.ts';

test('只改 docs/ 或 AGENTS.md 的提交必须使用 docs: 标题', () => {
  assert.equal(docsOnly(['docs/gameplay.md', 'AGENTS.md']), true);
  assert.equal(docsOnly(['docs/verification/2026-11.md']), true);
  assert.equal(docsOnly(['src/main.ts']), false);
  assert.equal(docsOnly(['docs/gameplay.md', 'src/main.ts']), false);
  assert.equal(docsOnly([]), false);
  assert.equal(docsSubject('docs: update rules'), true);
  assert.equal(docsSubject('docs(gameplay): update rules'), true);
  assert.equal(docsSubject('Add feature docs'), false);
  assert.equal(docsSubject('docs:'), false);
});

test('重复标题与文档提交冒用功能标题都会被拒绝', () => {
  const errors = checkCommits([
    {
      sha: '1111111',
      subject: 'Add feature',
      paths: ['src/main.ts'],
    },
    {
      sha: '2222222',
      subject: 'Add feature',
      paths: ['docs/gameplay.md'],
    },
  ]);
  assert.ok(errors.some((error) => error.startsWith('重复提交标题')));
  assert.ok(errors.some((error) => error.includes('只改文档但标题不是 docs:')));
  assert.deepEqual(
    checkCommits([
      { sha: '3333333', subject: 'Add feature', paths: ['src/main.ts'] },
      { sha: '4444444', subject: 'docs: update rules', paths: ['docs/gameplay.md'] },
    ]),
    [],
  );
});
