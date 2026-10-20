import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DOMPurify from 'dompurify'
import type { SearchHit, ShelfBook } from '@shared/types'
import { useReaderStore } from '@/store/useReaderStore'
import { useShelfStore } from '@/store/useShelfStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { compactNumber } from '@/lib/bridge'
import { afterLayout, isTypingTarget, moveToRatio, readRatio } from '@/lib/scroll'
import { markNearest } from '@/lib/find'
import { ChapterRail } from '@/components/ChapterRail'
import { SearchSheet } from '@/components/SearchSheet'
import { LookPanel } from '@/components/LookPanel'

type Panel = 'rail' | 'search' | 'look' | null

interface ReaderViewProps {
  book: ShelfBook
}

export function ReaderView({ book }: ReaderViewProps) {
  const open = useReaderStore((s) => s.open)
  const close = useReaderStore((s) => s.close)
  const goChapter = useReaderStore((s) => s.go)
  const record = useReaderStore((s) => s.record)
  const jumpTo = useReaderStore((s) => s.jump)
  const clearPending = useReaderStore((s) => s.clearPending)

  const toc = useReaderStore((s) => s.toc)
  const index = useReaderStore((s) => s.index)
  const chapter = useReaderStore((s) => s.chapter)
  const loading = useReaderStore((s) => s.loading)
  const error = useReaderStore((s) => s.error)
  const position = useReaderStore((s) => s.position)
  const pending = useReaderStore((s) => s.pending)

  const settings = usePrefsStore((s) => s.settings)
  const leaveReader = useShelfStore((s) => s.leaveReader)

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const paperRef = useRef<HTMLElement | null>(null)
  const frameRef = useRef(0)
  const restoredFor = useRef(-1)
  const [panel, setPanel] = useState<Panel>(null)

  useEffect(() => {
    void open(book)
    return () => {
      void close()
    }
    // 只按 id 打开一次；book 对象的引用变化不应重开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, open, close])

  useEffect(() => {
    const flush = (): void => {
      void useReaderStore.getState().flush()
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  // 章节渲染完成：复位到章首，或恢复到章内存档位置
  useEffect(() => {
    if (!chapter) return
    if (restoredFor.current === chapter.index) return
    restoredFor.current = chapter.index

    const scroller = scrollerRef.current
    if (!scroller) return

    const state = useReaderStore.getState()
    const isJump = state.pending?.chapter === chapter.index
    scroller.scrollTop = 0
    if (isJump) return

    const ratio =
      state.position && state.position.chapter === chapter.index ? state.position.ratio : 0
    afterLayout(() => {
      if (scrollerRef.current) moveToRatio(scrollerRef.current, ratio)
    })
  }, [chapter])

  // 搜索命中：等正文进入 DOM 后标记并滚动
  useEffect(() => {
    if (!chapter || !pending || pending.chapter !== chapter.index) return
    const paper = paperRef.current
    if (paper) markNearest(paper, pending.term, pending.offset)
    clearPending()
  }, [chapter, pending, clearPending])

  const handleScroll = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      const scroller = scrollerRef.current
      if (!scroller) return
      record(index, readRatio(scroller))
    })
  }, [index, record])

  const leave = useCallback(() => {
    void leaveReader()
  }, [leaveReader])

  const prev = useCallback(() => {
    if (index > 0) void goChapter(index - 1)
  }, [index, goChapter])

  const next = useCallback(() => {
    if (index < toc.length - 1) void goChapter(index + 1)
  }, [index, toc.length, goChapter])

  const toggle = useCallback((next: Exclude<Panel, null>) => {
    setPanel((current) => (current === next ? null : next))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'f') {
        event.preventDefault()
        setPanel('search')
        return
      }
      if (mod && key === 'b') {
        event.preventDefault()
        setPanel((current) => (current === 'rail' ? null : 'rail'))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (panel !== null) setPanel(null)
        else leave()
        return
      }
      if (isTypingTarget(event.target) || panel !== null) return

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        prev()
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        next()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, leave, prev, next])

  const cleanHtml = useMemo(() => {
    if (!chapter) return ''
    return DOMPurify.sanitize(chapter.html, {
      ADD_ATTR: ['width', 'height', 'colspan', 'rowspan', 'start'],
      ALLOWED_URI_REGEXP: /^(?:shijuan-asset:|data:image\/)/i
    })
  }, [chapter])

  const percent = position?.percent ?? 0
  const entry = toc[index]
  const chapterWord = entry && entry.depth === 0 ? '卷' : '章'

  const onHit = useCallback(
    (hit: SearchHit, term: string): void => {
      void jumpTo(hit, term)
      setPanel(null)
    },
    [jumpTo]
  )

  const style = {
    '--reading-size': `${settings.fontSize}px`,
    '--reading-leading': String(settings.lineHeight),
    '--reading-measure': `${settings.measure}px`,
    '--reading-family': settings.font === 'song' ? 'var(--font-serif)' : 'var(--font-sans)'
  } as CSSProperties

  return (
    <div className="reader-page" style={style} data-testid="reader-page">
      <header className="reader-bar">
        <button className="bar-back" onClick={leave} aria-label="返回书架">
          <span className="bar-arrow" aria-hidden="true">
            ←
          </span>
          <span className="bar-back-text">书架</span>
        </button>

        <span className="bar-divider" aria-hidden="true" />

        <div className="bar-heading">
          <span className="bar-book" title={book.title}>
            {book.title}
          </span>
          <span className="bar-chapter">{chapter?.title ?? (loading ? '正在载入…' : '')}</span>
        </div>

        <span className="bar-percent" title="全书进度">
          {percent.toFixed(0)}%
        </span>

        <nav className="bar-actions" aria-label="阅读工具">
          <button
            className={`bar-btn${panel === 'rail' ? ' bar-btn-on' : ''}`}
            onClick={() => toggle('rail')}
            aria-pressed={panel === 'rail'}
          >
            目录
          </button>
          <button
            className={`bar-btn${panel === 'search' ? ' bar-btn-on' : ''}`}
            onClick={() => toggle('search')}
            aria-pressed={panel === 'search'}
          >
            检索
          </button>
          <button
            className={`bar-btn${panel === 'look' ? ' bar-btn-on' : ''}`}
            data-look-toggle
            onClick={() => toggle('look')}
            aria-pressed={panel === 'look'}
          >
            版式
          </button>
        </nav>
      </header>

      <div className="reader-scroll" ref={scrollerRef} onScroll={handleScroll} data-testid="reader-scroll">
        {loading && !chapter ? (
          <div className="reader-hint">
            <span className="hint-line" />
            <p>正在展开这一章…</p>
          </div>
        ) : error ? (
          <div className="reader-hint reader-hint-error">
            <p className="hint-title">这一章没有打开</p>
            <p className="hint-detail">{error}</p>
            <button className="btn-primary" onClick={leave}>
              返回书架
            </button>
          </div>
        ) : chapter ? (
          <article className="reader-paper" ref={paperRef} data-testid="chapter-body">
            <header className="chapter-head">
              <p className="chapter-eyebrow">
                第 {index + 1} {chapterWord} · 共 {toc.length} {chapterWord}
              </p>
              <h1 className="chapter-title">{chapter.title}</h1>
              <p className="chapter-meta">
                {compactNumber(chapter.chars)} 字 · 全书 {percent}%
              </p>
            </header>

            <div
              className="reading-body"
              dangerouslySetInnerHTML={{ __html: cleanHtml }}
            />

            <footer className="chapter-foot">
              <span className="foot-rule" aria-hidden="true" />
              <span className="foot-text">本章完</span>
              {index < toc.length - 1 ? (
                <button className="foot-next" onClick={next}>
                  读下一章 →
                </button>
              ) : (
                <span className="foot-text">全书读至卷末</span>
              )}
            </footer>
          </article>
        ) : null}
      </div>

      <nav className="chapter-dock" aria-label="章节切换" data-testid="chapter-dock">
        <button className="dock-btn" onClick={prev} disabled={index <= 0} aria-label="上一章">
          ‹ 上一章
        </button>
        <span className="dock-count">
          <b>{index + 1}</b>
          <span className="dock-slash">/</span>
          {toc.length}
        </span>
        <button
          className="dock-btn"
          onClick={next}
          disabled={index >= toc.length - 1}
          aria-label="下一章"
        >
          下一章 ›
        </button>
      </nav>

      <div className="reading-line" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>

      <ChapterRail
        open={panel === 'rail'}
        toc={toc}
        active={index}
        onPick={(target) => {
          setPanel(null)
          void goChapter(target)
        }}
        onClose={() => setPanel(null)}
      />

      <SearchSheet
        open={panel === 'search'}
        totalChapters={toc.length}
        onJump={onHit}
        onClose={() => setPanel(null)}
      />

      <LookPanel open={panel === 'look'} onClose={() => setPanel(null)} />
    </div>
  )
}
