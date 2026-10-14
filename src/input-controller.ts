export function trapModalTab(event: KeyboardEvent, modal: HTMLElement): boolean {
  if (event.key !== 'Tab' || !modal.innerHTML) return false;
  const elements = [
    ...modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary, [tabindex="0"]',
    ),
  ].filter((element) => {
    if (
      element.tabIndex < 0 ||
      !element.getClientRects().length ||
      getComputedStyle(element).visibility === 'hidden'
    )
      return false;
    // 折叠 details 的子控件可能仍有布局框，但不能进入键盘焦点循环。
    for (
      let parent = element.parentElement;
      parent && parent !== modal;
      parent = parent.parentElement
    )
      if (
        parent instanceof HTMLDetailsElement &&
        !parent.open &&
        !parent.querySelector(':scope > summary')?.contains(element)
      )
        return false;
    return true;
  });
  if (!elements.length) return true;
  const first = elements[0],
    last = elements[elements.length - 1];
  if (!elements.includes(document.activeElement as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
  return true;
}

export function computeManualInput(
  keys: ReadonlySet<string>,
  touchInput: { x: number; y: number },
) {
  return {
    x:
      Number(keys.has('d') || keys.has('arrowright')) -
      Number(keys.has('a') || keys.has('arrowleft')) +
      touchInput.x,
    y:
      Number(keys.has('s') || keys.has('arrowdown')) -
      Number(keys.has('w') || keys.has('arrowup')) +
      touchInput.y,
  };
}
