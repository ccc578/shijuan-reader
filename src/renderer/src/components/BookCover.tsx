import { hueOf } from '@/lib/bridge'

interface BookCoverProps {
  seed: string
  title: string
  cover?: string
  size?: 'row' | 'hero'
}

/** 有 EPUB 封面用图，没有就按书名生成一块稳定色相的题名封面 */
export function BookCover({ seed, title, cover, size = 'row' }: BookCoverProps) {
  const hue = hueOf(seed)
  const mark = Array.from(title)[0] ?? '书'

  return (
    <span
      className={`book-cover book-cover-${size}`}
      style={{ ['--cover-hue' as string]: String(hue) }}
      aria-hidden="true"
    >
      {cover ? (
        <img className="book-cover-img" src={cover} alt="" />
      ) : (
        <>
          <span className="book-cover-mark">{mark}</span>
          <span className="book-cover-rule" />
        </>
      )}
    </span>
  )
}
