import test from 'node:test';
import assert from 'node:assert/strict';
import { optionalFontFailures } from '../scripts/ui-browser.ts';

const resourceError =
  'msgid=4 [error] Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED (0 args)';
const fonts =
  'reqid=4 GET https://fonts.loli.net/css2?family=Test [ERR_TUNNEL_CONNECTION_FAILED]\nreqid=5 GET https://gstatic.loli.net/font.woff2 [failed - 404]';

test('仅已批准公共字体的资源失败允许系统回退，脚本或本地失败不能放行', () => {
  assert.equal(optionalFontFailures(resourceError, fonts), true);
  assert.equal(
    optionalFontFailures(
      resourceError,
      fonts + '\nreqid=6 GET http://localhost:5173/assets/main.js [failed - 404]',
    ),
    false,
  );
  assert.equal(
    optionalFontFailures(
      resourceError,
      fonts + '\nreqid=6 GET https://unapproved.example.invalid/font [ERR_FAILED]',
    ),
    false,
  );
  assert.equal(optionalFontFailures('msgid=4 [error] Uncaught TypeError: error', fonts), false);
  assert.equal(
    optionalFontFailures(resourceError, 'reqid=4 GET https://fonts.loli.net/css2 [success - 200]'),
    false,
  );
  assert.equal(optionalFontFailures(resourceError, fonts.replaceAll('https:', 'http:')), false);
});
