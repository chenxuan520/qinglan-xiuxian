import { boundedAdJson } from './house-ad-contract.ts';
import type { AdLoadDiagnostic } from './ad-load-contract.ts';

export class AdResponseError extends Error {
  readonly code: AdLoadDiagnostic['code'];
  constructor(code: AdLoadDiagnostic['code']) {
    super(code);
    this.code = code;
  }
}

// 仅广告的小JSON响应使用兼容读取；Worker请求正文继续逐块限制，不走此回退。
export async function adResponseJson(response: Response, maxBytes: number): Promise<unknown> {
  const length = response.headers.get('Content-Length');
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new AdResponseError('too-large');
  }
  if (response.headers.get('Content-Type')?.toLowerCase().includes('text/html')) {
    void response.body?.cancel().catch(() => {});
    throw new AdResponseError('html');
  }
  if (
    response.body &&
    typeof response.body.getReader === 'function' &&
    typeof TextDecoder === 'function'
  ) {
    try {
      return await boundedAdJson(response, maxBytes);
    } catch (error) {
      throw new AdResponseError(
        error instanceof SyntaxError
          ? 'json'
          : error instanceof Error && error.message === 'body-too-large'
            ? 'too-large'
            : 'body-read',
      );
    }
  }
  // 部分WebView有fetch/text但不提供响应流或TextDecoder。先检查已知长度，
  // 原生读取完成后按UTF-8字节复核，再解析；此回退不冒称能逐块截断正文。
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AdResponseError('body-read');
  }
  if (new Blob([text]).size > maxBytes) throw new AdResponseError('too-large');
  if (!text.trim()) throw new AdResponseError('empty');
  try {
    return JSON.parse(text);
  } catch {
    throw new AdResponseError('json');
  }
}
