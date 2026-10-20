import { create } from 'zustand'
import type {
  ChapterPayload,
  ReadingPosition,
  SearchHit,
  ShelfBook,
  TocEntry
} from '@shared/types'
import { bookPercent, sanitizePosition } from '@shared/progress'
import { SAVE_DEBOUNCE_MS } from '@shared/constants'
import { api } from '@/lib/bridge'
import { useUiStore } from './useUiStore'
import { usePrefsStore } from './usePrefsStore'

interface ReaderState {
  bookId: string | null
  book: ShelfBook | null
  toc: TocEntry[]
  index: number
  chapter: ChapterPayload | null
  position: ReadingPosition | null
  loading: boolean
  error: string | null
  /** 待执行的搜索定位；正文渲染后由 ReaderView 消费 */
  pending: { chapter: number; term: string; offset: number } | null
  searchTerm: string
  searchHits: SearchHit[] | null
  searching: boolean
  open(book: ShelfBook): Promise<void>
  go(index: number): Promise<void>
  jump(hit: SearchHit, term: string): Promise<void>
  clearPending(): void
  record(chapter: number, ratio: number): void
  flush(): Promise<void>
  close(): Promise<void>
  runSearch(term: string): Promise<void>
  clearSearch(): void
}

let seq = 0
let writeTimer: ReturnType<typeof setTimeout> | undefined
let queued: { bookId: string; chapter: number; ratio: number; percent: number } | null = null

export const useReaderStore = create<ReaderState>()((set, get) => {
  async function load(bookId: string, index: number, stamp: number): Promise<void> {
    try {
      const chapter = await api.book.chapter(bookId, index)
      if (stamp !== seq) return
      set({ chapter, loading: false, error: null })
    } catch (error) {
      if (stamp !== seq) return
      const text = error instanceof Error ? error.message : '章节加载失败'
      set({ loading: false, error: text })
      useUiStore.getState().showToast(text)
    }
  }

  return {
    bookId: null,
    book: null,
    toc: [],
    index: 0,
    chapter: null,
    position: null,
    loading: false,
    error: null,
    pending: null,
    searchTerm: '',
    searchHits: null,
    searching: false,

    open: async (book) => {
      seq += 1
      const stamp = seq
      await get().flush()
      set({
        bookId: book.id,
        book,
        toc: book.toc,
        index: 0,
        chapter: null,
        position: null,
        loading: true,
        error: null,
        pending: null,
        searchTerm: '',
        searchHits: null
      })

      try {
        const [toc, saved] = await Promise.all([api.book.toc(book.id), api.position.read(book.id)])
        if (stamp !== seq) return
        const last = toc.length > 0 ? toc.length - 1 : 0
        const at = saved ? sanitizePosition(saved, toc.length).chapter : 0
        const position = saved
          ? sanitizePosition(saved, toc.length)
          : {
              bookId: book.id,
              chapter: 0,
              ratio: 0,
              percent: 0,
              savedAt: Date.now()
            }
        set({ toc, index: Math.min(at, last), position })
        await load(book.id, Math.min(at, last), stamp)
      } catch (error) {
        if (stamp !== seq) return
        set({ loading: false, error: error instanceof Error ? error.message : '打开失败' })
      }
    },

    go: async (target) => {
      const { bookId, toc, index } = get()
      if (!bookId || target < 0 || target >= toc.length || target === index) return

      seq += 1
      const stamp = seq
      await get().flush()

      const percent = bookPercent(toc, target, 0)
      set({
        index: target,
        chapter: null,
        loading: true,
        error: null,
        pending: null,
        position: {
          bookId,
          chapter: target,
          ratio: 0,
          percent,
          savedAt: Date.now()
        }
      })

      // 切章立即落盘：即便随后直接退出，书架也停在新章
      queued = { bookId, chapter: target, ratio: 0, percent }
      await get().flush()
      await load(bookId, target, stamp)
    },

    jump: async (hit, term) => {
      const { index, toc } = get()
      set({ pending: { chapter: hit.chapter, term, offset: hit.offset } })
      if (hit.chapter === index) return
      await get().go(hit.chapter)
      set({ pending: { chapter: hit.chapter, term, offset: hit.offset } })
    },

    clearPending: () => set({ pending: null }),

    record: (chapter, ratio) => {
      const { bookId, toc, position } = get()
      if (!bookId) return
      const percent = bookPercent(toc, chapter, ratio)
      const next: ReadingPosition = {
        bookId,
        chapter,
        ratio,
        percent,
        savedAt: Date.now()
      }
      set({ position: next })
      queued = { bookId, chapter, ratio, percent }
      if (writeTimer) clearTimeout(writeTimer)
      writeTimer = setTimeout(() => {
        void get().flush()
      }, SAVE_DEBOUNCE_MS)
    },

    flush: async () => {
      if (writeTimer) {
        clearTimeout(writeTimer)
        writeTimer = undefined
      }
      const input = queued
      queued = null
      if (!input) return
      try {
        await api.position.write(input)
      } catch {
        // 进度写失败不打断阅读，下一次滚动还会重试
      }
    },

    close: async () => {
      seq += 1
      await get().flush()
      set({
        bookId: null,
        book: null,
        toc: [],
        index: 0,
        chapter: null,
        position: null,
        loading: false,
        error: null,
        pending: null,
        searchTerm: '',
        searchHits: null,
        searching: false
      })
    },

    runSearch: async (term) => {
      const { bookId } = get()
      if (!bookId) return
      if (term.trim() === '') {
        set({ searchHits: null, searchTerm: '', searching: false })
        return
      }
      set({ searching: true, searchTerm: term })
      try {
        const searchHits = await api.book.find(bookId, term)
        set({ searchHits, searching: false })
      } catch {
        set({ searchHits: [], searching: false })
        useUiStore.getState().showToast('搜索没有完成，请稍后再试')
      }
    },

    clearSearch: () => set({ searchTerm: '', searchHits: null, searching: false })
  }
})

/** 离开阅读器前把最新进度同步到书架列表，避免回到书架看到旧百分比 */
export function applyReaderSnapshot(books: ShelfBook[], state: ReaderState): ShelfBook[] {
  if (!state.bookId || !state.position) return books
  return books.map((book) =>
    book.id === state.bookId ? { ...book, position: state.position } : book
  )
}
