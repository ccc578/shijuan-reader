import { scrollRatio, scrollTopFor } from '@shared/progress'

export function readRatio(scroller: HTMLElement): number {
  return scrollRatio(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight)
}

export function moveToRatio(scroller: HTMLElement, ratio: number): void {
  scroller.scrollTop = scrollTopFor(ratio, scroller.scrollHeight, scroller.clientHeight)
}

/** 等两帧，让图片与字体排版落定后再恢复位置 */
export function afterLayout(task: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(task))
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}
