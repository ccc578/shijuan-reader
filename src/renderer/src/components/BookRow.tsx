import type { ShelfBook } from '@shared/types'
import { BookCover } from './BookCover'

interface BookRowProps {
  book: ShelfBook
  rank: number
  onOpen(book: ShelfBook): void
  onDelete(bookId: string): void
}

export function BookRow({ book, rank, onOpen, onDelete }: BookRowProps) {
  const position = book.position
  const percent = position?.percent ?? 0
  const chapterNo = position ? position.chapter + 1 : 0
  const label = position
    ? `第 ${chapterNo} / ${book.toc.length} 章`
    : `共 ${book.toc.length} 章 · 尚未开卷`

  return (
    <article className="book-row" data-testid="book-row">
      <span className="row-index">{String(rank + 1).padStart(2, '0')}</span>
      <BookCover seed={book.title} title={book.title} cover={book.cover} />

      <button className="row-main" onClick={() => onOpen(book)} title={`打开《${book.title}》`}>
        <span className="row-title">{book.title}</span>
        <span className="row-meta">
          <span className={`row-chip row-chip-${book.format}`}>{book.format.toUpperCase()}</span>
          {book.author && <span className="row-author">{book.author}</span>}
          <span className="row-count">{book.toc.length} 章</span>
        </span>
      </button>

      <div className="row-progress">
        <div className="row-progress-text">
          <span>{label}</span>
          <strong>{percent > 0 ? `${percent}%` : '—'}</strong>
        </div>
        <div className="track" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      </div>

      <button className="row-open" onClick={() => onOpen(book)}>
        {position ? '续读' : '开卷'}
      </button>

      <button
        className="row-delete"
        onClick={() => onDelete(book.id)}
        aria-label={`移除《${book.title}》`}
        title="从书架移除"
      >
        ×
      </button>
    </article>
  )
}
