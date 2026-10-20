import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SearchHit } from '@shared/types'
import { useReaderStore } from '@/store/useReaderStore'

interface SearchSheetProps {
  open: boolean
  totalChapters: number
  onJump(hit: SearchHit, term: string): void
  onClose(): void
}

function Parts({ text, term }: { text: string; term: string }) {
  const needle = term.trim()
  if (needle === '') return <>{text}</>
  const lower = text.toLowerCase()
  const target = needle.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let key = 0

  for (;;) {
    const at = lower.indexOf(target, cursor)
    if (at === -1) break
    if (at > cursor) parts.push(text.slice(cursor, at))
    parts.push(
      <mark key={key} className="snippet-hit">
        {text.slice(at, at + needle.length)}
      </mark>
    )
    key += 1
    cursor = at + needle.length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

export function SearchSheet({ open, totalChapters, onJump, onClose }: SearchSheetProps) {
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const runSearch = useReaderStore((s) => s.runSearch)
  const clearSearch = useReaderStore((s) => s.clearSearch)
  const hits = useReaderStore((s) => s.searchHits)
  const searching = useReaderStore((s) => s.searching)
  const activeTerm = useReaderStore((s) => s.searchTerm)

  useEffect(() => {
    if (!open) {
      setTerm('')
      clearSearch()
      return
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 160)
    return () => clearTimeout(timer)
  }, [open, clearSearch])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      void runSearch(term)
    }, 260)
    return () => clearTimeout(timer)
  }, [term, open, runSearch])

  if (!open) return null

  const chaptersHit = new Set((hits ?? []).map((hit) => hit.chapter)).size

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="search-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="全书检索"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="search-head">
          <div className="search-field">
            <span className="search-glyph" aria-hidden="true">
              检
            </span>
            <input
              ref={inputRef}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch(term)
              }}
              placeholder="在整本书里找一句话、一个名字…"
              aria-label="检索关键词"
            />
            {term !== '' && (
              <button className="search-clear" onClick={() => setTerm('')} aria-label="清空">
                ×
              </button>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭检索">
            ×
          </button>
        </header>

        <div className="search-status">
          {term.trim() === ''
            ? `全书 ${totalChapters} 章，输入关键词后自动检索`
            : searching
              ? '正在翻检…'
              : hits && hits.length > 0
                ? `命中 ${hits.length} 处，分布在 ${chaptersHit} 章`
                : '没有找到匹配内容'}
        </div>

        <div className="search-results">
          {(hits ?? []).map((hit, index) => (
            <button
              key={`${hit.chapter}-${hit.offset}-${index}`}
              className="search-row"
              onClick={() => onJump(hit, activeTerm)}
            >
              <span className="search-row-head">
                <span className="search-row-chapter">{hit.title}</span>
                <span className="search-row-no">第 {hit.chapter + 1} 章</span>
              </span>
              <span className="search-row-text">
                <Parts text={hit.excerpt} term={activeTerm} />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
