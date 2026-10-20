import { create } from 'zustand'
import type { ImportSummary, ShelfBook } from '@shared/types'
import { api, explain } from '@/lib/bridge'
import { readableError } from '@shared/ipc'
import { useUiStore } from './useUiStore'
import { usePrefsStore } from './usePrefsStore'
import { applyReaderSnapshot, useReaderStore } from './useReaderStore'

interface ShelfState {
  books: ShelfBook[]
  loading: boolean
  load(): Promise<void>
  pick(): Promise<void>
  addFiles(paths: string[]): Promise<void>
  remove(bookId: string): Promise<void>
  open(book: ShelfBook): void
  leaveReader(): Promise<void>
}

function describeImport(result: ImportSummary): string | null {
  const added = result.imported.length
  const failed = result.rejected.length
  if (added === 0 && failed === 0) return null

  const first = result.rejected[0]
  const detail = first ? readableError(first.reason) : ''
  if (failed === 0) return `已加入 ${added} 本`
  if (added === 0) return `${failed} 本未能导入${detail ? `：${detail}` : ''}`
  return `已加入 ${added} 本，${failed} 本未能导入${detail ? `：${detail}` : ''}`
}

export const useShelfStore = create<ShelfState>()((set, get) => ({
  books: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const books = await api.shelf.list()
      set({ books })
    } catch (error) {
      useUiStore.getState().showToast(explain(error, '书架读取失败'))
    } finally {
      set({ loading: false })
    }
  },

  pick: async () => {
    try {
      const result = await api.shelf.pick()
      const message = describeImport(result)
      if (message) useUiStore.getState().showToast(message)
      await get().load()
    } catch (error) {
      useUiStore.getState().showToast(explain(error, '导入没有完成'))
    }
  },

  addFiles: async (paths) => {
    if (paths.length === 0) return
    try {
      const result = await api.shelf.add(paths)
      const message = describeImport(result)
      if (message) useUiStore.getState().showToast(message)
      await get().load()
    } catch (error) {
      useUiStore.getState().showToast(explain(error, '导入没有完成'))
    }
  },

  remove: async (bookId) => {
    try {
      await api.shelf.drop(bookId)
      useUiStore.getState().showToast('已移除')
    } catch (error) {
      useUiStore.getState().showToast(explain(error, '删除失败'))
    } finally {
      useUiStore.getState().cancelDelete()
      await get().load()
    }
  },

  open: (book) => {
    useUiStore.getState().openReader(book.id)
    void usePrefsStore.getState().patch({ lastBookId: book.id })
  },

  leaveReader: async () => {
    const reader = useReaderStore.getState()
    await reader.flush()
    set((state) => ({ books: applyReaderSnapshot(state.books, reader) }))
    await reader.close()
    useUiStore.getState().backToShelf()
    await get().load()
  }
}))
