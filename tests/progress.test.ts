import { describe, expect, it } from 'vitest'
import {
  bookPercent,
  percent1,
  sanitizePosition,
  scrollRatio,
  scrollTopFor,
  unit
} from '../src/shared/progress'

const toc = [{ chars: 100 }, { chars: 300 }, { chars: 600 }]

describe('bookPercent', () => {
  it('按章节字符数加权', () => {
    expect(bookPercent(toc, 0, 0)).toBe(0)
    expect(bookPercent(toc, 1, 0)).toBe(10)
    expect(bookPercent(toc, 1, 1)).toBe(40)
    expect(bookPercent(toc, 2, 0.5)).toBe(70)
  })

  it('越界章节与比例被夹紧', () => {
    expect(bookPercent(toc, 9, 2)).toBe(100)
    expect(bookPercent(toc, -3, -1)).toBe(0)
    expect(bookPercent([], 0, 0.5)).toBe(0)
    expect(bookPercent([{ chars: 0 }], 0, 1)).toBe(0)
  })
})

describe('scrollRatio', () => {
  it('不可滚动的容器视为读完', () => {
    expect(scrollRatio(0, 100, 100)).toBe(1)
    expect(scrollRatio(10, 50, 100)).toBe(1)
  })

  it('与 scrollTopFor 互逆', () => {
    expect(scrollRatio(250, 1000, 500)).toBe(0.5)
    expect(scrollTopFor(0.5, 1000, 500)).toBe(250)
  })

  it('非法输入归零', () => {
    expect(scrollRatio(Number.NaN, 800, 200)).toBe(0)
    expect(scrollTopFor(Number.NaN, 800, 200)).toBe(0)
  })
})

describe('数值规整', () => {
  it('unit 夹在 0..1', () => {
    expect(unit(-1)).toBe(0)
    expect(unit(2)).toBe(1)
    expect(unit(Number.NaN)).toBe(0)
  })

  it('percent1 保留一位小数', () => {
    expect(percent1(12.345)).toBe(12.3)
    expect(percent1(-4)).toBe(0)
    expect(percent1(140)).toBe(100)
  })

  it('sanitizePosition 修正越界章节', () => {
    const fixed = sanitizePosition(
      { bookId: 'b', chapter: 99, ratio: 1.8, percent: 180, savedAt: 1 },
      3
    )
    expect(fixed.chapter).toBe(2)
    expect(fixed.ratio).toBe(1)
    expect(fixed.percent).toBe(100)
  })
})
