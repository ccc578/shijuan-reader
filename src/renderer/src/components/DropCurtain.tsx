interface DropCurtainProps {
  visible: boolean
}

export function DropCurtain({ visible }: DropCurtainProps) {
  if (!visible) return null
  return (
    <div className="drop-curtain" aria-hidden="true">
      <div className="drop-card">
        <span className="drop-glyph">卷</span>
        <p className="drop-title">松手，放进书架</p>
        <p className="drop-hint">TXT 与 EPUB 均可</p>
      </div>
    </div>
  )
}
