// 此函数经 MCP evaluate_script 在页面内执行；不能引用模块外的变量。
export async function uiClickTarget(selector: string, timeoutMs = 5000) {
  const until = performance.now() + timeoutMs;
  const fail = () => new Error(`元素未变为可点击状态：${selector}`);
  const frame = () =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          cancelAnimationFrame(id);
          reject(fail());
        },
        Math.max(0, until - performance.now()),
      );
      const id = requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  while (performance.now() < until) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      await frame();
      const before = node.getBoundingClientRect();
      await frame();
      const rect = node.getBoundingClientRect();
      const stable = (['x', 'y', 'width', 'height'] as const).every(
        (key) => Math.abs(rect[key] - before[key]) < 0.5,
      );
      const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
      const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
      const style = getComputedStyle(node);
      if (
        node.isConnected &&
        performance.now() < until &&
        document.querySelector(selector) === node &&
        stable &&
        rect.width > 0 &&
        rect.height > 0 &&
        x > 0 &&
        x < innerWidth &&
        y > 0 &&
        y < innerHeight &&
        style.visibility === 'visible' &&
        style.display !== 'none' &&
        !node.matches(':disabled, [aria-disabled="true"]') &&
        !node.closest('[inert], [aria-hidden="true"]') &&
        node.contains(document.elementFromPoint(x, y))
      ) {
        // 坐标跨MCP调用可能失效；实际指针事件到达时再核对身份，阻止误点并记录失败。
        // 结果放独立sessionStorage键，以便真实刷新后仍能确认点击发生在预期节点上。
        const key = 'qinglan-ui-click-result';
        const done = 'qinglan-ui-click-complete';
        const token = `${performance.timeOrigin}:${performance.now()}`;
        const result = { token, status: 'pending' };
        const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        const cleanup = () => {
          for (const type of types) window.removeEventListener(type, guard, true);
          window.removeEventListener(done, cleanup);
          clearTimeout(timer);
        };
        const guard = (event: Event) => {
          const valid =
            result.status !== 'blocked' &&
            node.isConnected &&
            document.querySelector(selector) === node &&
            !node.matches(':disabled, [aria-disabled="true"]') &&
            !node.closest('[inert], [aria-hidden="true"]') &&
            event.composedPath().includes(node);
          if (!valid) {
            event.preventDefault();
            event.stopImmediatePropagation();
            result.status = 'blocked';
          } else if (event.type === 'click') result.status = 'clicked';
          sessionStorage.setItem(key, JSON.stringify(result));
        };
        sessionStorage.setItem(key, JSON.stringify(result));
        for (const type of types) window.addEventListener(type, guard, true);
        window.addEventListener(done, cleanup);
        const timer = setTimeout(cleanup, timeoutMs);
        return { x, y, token };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw fail();
}

// 在MCP真实点击后执行；标签页刷新也不能把未命中目标的点击误报为成功。
export function uiClickResult(token: string) {
  window.dispatchEvent(new Event('qinglan-ui-click-complete'));
  const key = 'qinglan-ui-click-result';
  const result = JSON.parse(sessionStorage.getItem(key) ?? 'null');
  sessionStorage.removeItem(key);
  if (result?.token !== token || result.status !== 'clicked')
    throw new Error('真实点击未命中预期元素，目标已变化或不可交互');
  return true;
}
