import { useEffect, useMemo, useRef, useState } from 'react'
import type { TocEntry } from '@shared/types'

interface ChapterRailProps {
  open: boolean
  toc: TocEntry[]
  active: number
  onPick(index: number): void
  onClose(): void
}

export function ChapterRail({ open, toc, active, onPick, onClose }: ChapterRailProps) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setFilter('')
      return
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 180)
    return () => clearTimeout(timer)
  }, [open])

  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    if (keyword === '') return toc
    return toc.filter((entry) => entry.title.toLowerCase().includes(keyword))
  }, [toc, filter])

  return (
    <>
      {open && <div className="sheet-backdrop rail-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`chapter-rail${open ? ' chapter-rail-open' : ''}`}
        role="dialog"
        aria-modal={open}
        aria-label="目录"
        aria-hidden={!open}
      >
        <header className="rail-head">
          <div>
            <p className="rail-eyebrow">CONTENTS</p>
            <h2 className="rail-title">目录</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭目录">
            ×
          </button>
        </header>

        <div className="rail-filter">
          <input
            ref={inputRef}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="按标题筛选章节"
            aria-label="筛选章节"
            tabIndex={open ? 0 : -1}
          />
          <span className="rail-total">{visible.length} / {toc.length}</span>
        </div>

        <div className="rail-list" role="list">
          {visible.length === 0 ? (
            <p className="rail-empty">没有匹配的章节</p>
          ) : (
            visible.map((entry) => (
              <button
                key={entry.index}
                role="listitem"
                className={`rail-item rail-depth-${entry.depth}${entry.index === active ? ' rail-item-active' : ''}`}
                onClick={() => onPick(entry.index)}
                aria-current={entry.index === active ? 'true' : undefined}
                title={entry.title}
              >
                <span className="rail-no">{String(entry.index + 1).padStart(2, '0')}</span>
                <span className="rail-label">{entry.title}</span>
              </button>
            ))
          )}
        </div>

        <footer className="rail-foot">
          <span>当前第 {active + 1} 章</span>
          <span>共 {toc.length} 章</span>
        </footer>
      </aside>
    </>
  )
}
