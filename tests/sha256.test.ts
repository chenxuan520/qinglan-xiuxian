import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256 } from '../src/sha256.ts';

test('SHA-256公认标准向量覆盖空串、abc、多块输入和百万a', () => {
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['a'.repeat(1000000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
  ];
  for (const [text, expected] of vectors) assert.equal(sha256(text), expected);
});

test('UTF-8、填充边界及连续独立调用与Node/WebCrypto两种独立实现一致', async () => {
  for (const size of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1024, 16384]) {
    for (const text of ['x'.repeat(size), '青岚🙂\u0000\ud800'.repeat(size)]) {
      const expected = createHash('sha256').update(text).digest('hex');
      assert.equal(sha256(text), expected);
      const native = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      assert.equal(sha256(text), Buffer.from(native).toString('hex'));
      assert.equal(
        sha256('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    }
  }
});
