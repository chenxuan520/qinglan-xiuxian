// 较旧的手机浏览器未必实现 AbortSignal.any / timeout；使用基本 AbortController。
export function monitorDeadline(controller: AbortController, milliseconds: number) {
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, milliseconds);
  return { expired: () => expired, clear: () => clearTimeout(timer) };
}
