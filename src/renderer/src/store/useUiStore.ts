import { create } from 'zustand'

interface UiState {
  view: 'shelf' | 'reader'
  activeId: string | null
  toast: { id: number; text: string } | null
  pendingDelete: string | null
  showToast(text: string): void
  clearToast(): void
  askDelete(bookId: string): void
  cancelDelete(): void
  openReader(bookId: string): void
  backToShelf(): void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>()((set, get) => ({
  view: 'shelf',
  activeId: null,
  toast: null,
  pendingDelete: null,

  showToast: (text) => {
    if (toastTimer) clearTimeout(toastTimer)
    const id = Date.now()
    set({ toast: { id, text } })
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 2800)
  },

  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: null })
  },

  askDelete: (bookId) => set({ pendingDelete: bookId }),
  cancelDelete: () => set({ pendingDelete: null }),

  openReader: (bookId) => set({ view: 'reader', activeId: bookId }),
  backToShelf: () => set({ view: 'shelf', activeId: null })
}))
