/**
 * 拾卷 ShiJuan —— 跨进程共享类型。
 * 本目录只放纯 TS：不 import electron，也不 import node 内置模块。
 */

export type BookFormat = 'txt' | 'epub'

/** 三套阅读底色：月白 / 茶烟 / 玄墨 */
export type ThemeName = 'moon' | 'tea' | 'night'

/** 正文字族：宋（衬线）与黑（无衬线） */
export type FontStack = 'song' | 'hei'

export interface TocEntry {
  /** 0 基下标，与数组顺序一致 */
  index: number
  title: string
  /** 0 = 卷/部/篇，1 = 章/节/回 */
  depth: number
  /** 正文字符数；空章记标题长度，避免进度权重为 0 */
  chars: number
}

export interface BookMeta {
  id: string
  title: string
  author?: string
  format: BookFormat
  /** 导入时的原始文件名 */
  sourceName: string
  bytes: number
  importedAt: number
  /** EPUB 封面 data URL；TXT 无 */
  cover?: string
  toc: TocEntry[]
  chars: number
}

export interface ReadingPosition {
  bookId: string
  chapter: number
  /** 章内滚动比例 0..1 */
  ratio: number
  /** 全书百分比，保留 1 位小数 */
  percent: number
  savedAt: number
}

export interface ShelfBook extends BookMeta {
  position: ReadingPosition | null
}

export interface ReaderSettings {
  theme: ThemeName
  /** 15..30 px */
  fontSize: number
  /** 1.5..2.2 */
  lineHeight: number
  /** 520..920 px */
  measure: number
  font: FontStack
  lastBookId?: string
}

export interface ChapterPayload {
  index: number
  title: string
  /** 已净化的 HTML 片段 */
  html: string
  chars: number
}

export interface SearchHit {
  chapter: number
  title: string
  /** 命中处前后各约 36 字 */
  excerpt: string
  /** 章内纯文本码点偏移 */
  offset: number
}

export interface RejectedFile {
  name: string
  reason: string
}

export interface ImportSummary {
  imported: BookMeta[]
  rejected: RejectedFile[]
}

export interface PositionInput {
  bookId: string
  chapter: number
  ratio: number
  percent: number
}

/** preload 通过 contextBridge 暴露的只读能力表 */
export interface ShiJuanApi {
  version: string
  platform: string
  shelf: {
    list(): Promise<ShelfBook[]>
    pick(): Promise<ImportSummary>
    add(paths: string[]): Promise<ImportSummary>
    drop(bookId: string): Promise<void>
  }
  book: {
    toc(bookId: string): Promise<TocEntry[]>
    chapter(bookId: string, index: number): Promise<ChapterPayload>
    find(bookId: string, term: string): Promise<SearchHit[]>
  }
  position: {
    read(bookId: string): Promise<ReadingPosition | null>
    write(input: PositionInput): Promise<void>
  }
  prefs: {
    read(): Promise<ReaderSettings>
    write(patch: Partial<ReaderSettings>): Promise<ReaderSettings>
  }
  /** 沙箱下 File 拿不到磁盘路径，必须经 preload 的 webUtils 转换 */
  pathOf(file: unknown): string
}
