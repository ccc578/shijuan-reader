import { useEffect, useMemo, useState } from 'react'
import { api, compactNumber } from '@/lib/bridge'
import { useShelfStore } from '@/store/useShelfStore'
import { useUiStore } from '@/store/useUiStore'
import { BookRow } from '@/components/BookRow'
import { ContinueCard } from '@/components/ContinueCard'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DropCurtain } from '@/components/DropCurtain'

export function ShelfView() {
  const books = useShelfStore((s) => s.books)
  const loading = useShelfStore((s) => s.loading)
  const pick = useShelfStore((s) => s.pick)
  const addFiles = useShelfStore((s) => s.addFiles)
  const remove = useShelfStore((s) => s.remove)
  const open = useShelfStore((s) => s.open)

  const pendingDelete = useUiStore((s) => s.pendingDelete)
  const cancelDelete = useUiStore((s) => s.cancelDelete)
  const askDelete = useUiStore((s) => s.askDelete)

  const [dragging, setDragging] = useState(false)

  // 整窗拖放：沙箱下拿不到 File.path，统一经 preload 的 webUtils 转换
  useEffect(() => {
    let depth = 0
    const carriesFiles = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files')

    const onEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onOver = (event: DragEvent): void => {
      if (carriesFiles(event)) event.preventDefault()
    }
    const onLeave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      const paths = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => api.pathOf(file))
        .filter((path) => path !== '')
      void addFiles(paths)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  const stats = useMemo(() => {
    const reading = books.filter((book) => book.position !== null).length
    const chars = books.reduce((sum, book) => sum + book.chars, 0)
    return { total: books.length, reading, chars }
  }, [books])

  const featured = books[0] ?? null
  const pendingBook = books.find((book) => book.id === pendingDelete) ?? null

  return (
    <div className="shelf-page">
      <header className="shelf-top">
        <div className="brand">
          <span className="brand-seal" aria-hidden="true">
            拾
          </span>
          <div className="brand-text">
            <h1 className="brand-name">拾卷</h1>
            <p className="brand-note">本地藏书 · 不联网也能读</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="top-mode">TXT / EPUB</span>
          <button className="btn-primary" onClick={() => void pick()}>
            导入书籍
          </button>
        </div>
      </header>

      <main className="shelf-body">
        {books.length > 0 && featured && (
          <section className="shelf-lead">
            <ContinueCard book={featured} onOpen={open} />
            <aside className="shelf-stats" aria-label="书架概览">
              <div className="stat">
                <span className="stat-label">藏书</span>
                <span className="stat-value">{stats.total}</span>
                <span className="stat-unit">卷</span>
              </div>
              <div className="stat">
                <span className="stat-label">在读</span>
                <span className="stat-value">{stats.reading}</span>
                <span className="stat-unit">卷</span>
              </div>
              <div className="stat">
                <span className="stat-label">累计字数</span>
                <span className="stat-value">{compactNumber(stats.chars)}</span>
              </div>
              <p className="stat-foot">所有书籍与进度只保存在这台电脑上</p>
            </aside>
          </section>
        )}

        <section className="shelf-list">
          <div className="list-head">
            <span>书架</span>
            <span className="list-head-note">
              {books.length > 0 ? `${books.length} 卷 · 按最近阅读排序` : '等待第一本书'}
            </span>
          </div>

          {loading && books.length === 0 ? (
            <p className="shelf-loading">正在翻开书架…</p>
          ) : books.length === 0 ? (
            <div className="shelf-empty">
              <span className="empty-mark" aria-hidden="true">
                卷
              </span>
              <h2 className="empty-title">架上无书</h2>
              <p className="empty-hint">拖一本书进来，或点右上角「导入书籍」</p>
              <button className="btn-primary empty-btn" onClick={() => void pick()}>
                选择 TXT / EPUB
              </button>
            </div>
          ) : (
            <div className="book-list" data-testid="book-list">
              {books.map((book, index) => (
                <BookRow
                  key={book.id}
                  book={book}
                  rank={index}
                  onOpen={open}
                  onDelete={askDelete}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <DropCurtain visible={dragging} />

      {pendingBook && (
        <ConfirmDialog
          title={`移除《${pendingBook.title}》`}
          detail="只会从书架和本机数据里删除，原文件不受影响。"
          confirmText="移除"
          onConfirm={() => void remove(pendingBook.id)}
          onCancel={cancelDelete}
        />
      )}
    </div>
  )
}
