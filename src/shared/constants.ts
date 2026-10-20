import type { FontStack, ReaderSettings, ThemeName } from './types'

/** 单本导入上限 50MB */
export const MAX_BOOK_BYTES = 50 * 1024 * 1024
/** 封面内联上限，超出退化为题名封面 */
export const MAX_COVER_BYTES = 1024 * 1024

export const LIMITS = {
  fontSize: { min: 15, max: 30 },
  lineHeight: { min: 1.5, max: 2.2 },
  measure: { min: 520, max: 920 }
} as const

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'moon',
  fontSize: 18,
  lineHeight: 1.8,
  measure: 700,
  font: 'song'
}

export const THEMES: ThemeName[] = ['moon', 'tea', 'night']

export const THEME_LABEL: Record<ThemeName, string> = {
  moon: '月白',
  tea: '茶烟',
  night: '玄墨'
}

export const FONT_LABEL: Record<FontStack, string> = {
  song: '宋体',
  hei: '黑体'
}

/** 滚动位置停稳后落盘的等待时长 */
export const SAVE_DEBOUNCE_MS = 320
/** 章节渲染后等待排版稳定的兜底时长 */
export const RESTORE_SETTLE_MS = 260
/** 单次全书搜索的命中上限 */
export const SEARCH_HIT_LIMIT = 200
