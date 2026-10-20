import { useEffect } from 'react'
import { usePrefsStore } from '@/store/usePrefsStore'
import { useShelfStore } from '@/store/useShelfStore'
import { useUiStore } from '@/store/useUiStore'
import { ShelfView } from '@/views/ShelfView'
import { ReaderView } from '@/views/ReaderView'
import { Toast } from '@/components/Toast'

export function App() {
  const view = useUiStore((s) => s.view)
  const activeId = useUiStore((s) => s.activeId)
  const books = useShelfStore((s) => s.books)
  const loadShelf = useShelfStore((s) => s.load)
  const settings = usePrefsStore((s) => s.settings)
  const loadPrefs = usePrefsStore((s) => s.load)

  useEffect(() => {
    void loadPrefs()
    void loadShelf()
  }, [loadPrefs, loadShelf])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const activeBook = books.find((book) => book.id === activeId) ?? null

  return (
    <>
      {view === 'reader' && activeBook ? (
        <ReaderView key={activeBook.id} book={activeBook} />
      ) : (
        <ShelfView />
      )}
      <Toast />
    </>
  )
}
