import type { ReadingPosition, TocEntry } from './types'

export function unit(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function percent1(value: number): number {
  if (!Number.isFinite(value)) return 0
  const bounded = Math.min(100, Math.max(0, value))
  return Math.round(bounded * 10) / 10
}

/**
 * 全书百分比按字符数加权：
 * 前序章节字符 + 当前章字符 × 章内比例，再除以总字符。
 */
export function bookPercent(
  toc: Pick<TocEntry, 'chars'>[],
  chapter: number,
  ratio: number
): number {
  if (!Array.isArray(toc) || toc.length === 0) return 0
  const total = toc.reduce((sum, item) => sum + Math.max(0, item.chars || 0), 0)
  if (total <= 0) return 0

  const at = Math.min(Math.max(0, Math.trunc(chapter)), toc.length - 1)
  let done = 0
  for (let i = 0; i < at; i += 1) done += Math.max(0, toc[i].chars || 0)
  done += Math.max(0, toc[at].chars || 0) * unit(ratio)
  return percent1((done / total) * 100)
}

/** 章内滚动比例；内容不足一屏时视为读完 */
export function scrollRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const span = scrollHeight - clientHeight
  if (!Number.isFinite(span) || span <= 1) return 1
  return unit(scrollTop / span)
}

/** 由比例反推 scrollTop，与 scrollRatio 互逆 */
export function scrollTopFor(ratio: number, scrollHeight: number, clientHeight: number): number {
  const span = Math.max(0, scrollHeight - clientHeight)
  return unit(ratio) * span
}

/** 存档可能来自旧版本或被手工改动，读取时统一夹紧 */
export function sanitizePosition(pos: ReadingPosition, chapterCount: number): ReadingPosition {
  const last = Math.max(0, chapterCount - 1)
  return {
    ...pos,
    chapter: Math.min(Math.max(0, Math.trunc(pos.chapter || 0)), last),
    ratio: unit(pos.ratio),
    percent: percent1(pos.percent || 0)
  }
}
