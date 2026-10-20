import type { ShelfBook } from '@shared/types'
import { shortStamp } from '@/lib/bridge'
import { BookCover } from './BookCover'

interface ContinueCardProps {
  book: ShelfBook
  onOpen(book: ShelfBook): void
}

export function ContinueCard({ book, onOpen }: ContinueCardProps) {
  const position = book.position
  const chapter = position ? book.toc[position.chapter] : book.toc[0]
  const percent = position?.percent ?? 0

  return (
    <section className="continue-card" data-testid="continue-card">
      <span className="continue-orbit continue-orbit-a" aria-hidden="true" />
      <span className="continue-orbit continue-orbit-b" aria-hidden="true" />

      <div className="continue-copy">
        <p className="continue-eyebrow">
          接着上次
          {position ? ` · ${shortStamp(position.savedAt)}` : ' · 尚未开始'}
        </p>
        <h2 className="continue-title">{book.title}</h2>
        <p className="continue-line">{chapter?.title ?? '第一章'} · 读至 {percent}%</p>
        <button className="continue-btn" onClick={() => onOpen(book)}>
          {position ? '继续阅读' : '开始阅读'}
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <BookCover seed={book.title} title={book.title} cover={book.cover} size="hero" />
    </section>
  )
}
