import { useEffect, useRef } from 'react'
import type { FontStack, ThemeName } from '@shared/types'
import { DEFAULT_SETTINGS, FONT_LABEL, LIMITS, THEMES, THEME_LABEL } from '@shared/constants'
import { usePrefsStore } from '@/store/usePrefsStore'

interface LookPanelProps {
  open: boolean
  onClose(): void
}

export function LookPanel({ open, onClose }: LookPanelProps) {
  const settings = usePrefsStore((s) => s.settings)
  const patch = usePrefsStore((s) => s.patch)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (ref.current?.contains(target)) return
      if (target.closest('[data-look-toggle]')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open) return null

  const sizeStep = (delta: number): void => {
    const next = Math.min(
      LIMITS.fontSize.max,
      Math.max(LIMITS.fontSize.min, settings.fontSize + delta)
    )
    if (next !== settings.fontSize) void patch({ fontSize: next })
  }

  return (
    <div className="look-panel" role="dialog" aria-label="版式设置" ref={ref}>
      <header className="look-head">
        <h2 className="look-title">版式</h2>
        <button className="icon-btn" onClick={onClose} aria-label="关闭版式设置">
          ×
        </button>
      </header>

      <section className="look-section">
        <p className="look-label">底色</p>
        <div className="look-themes">
          {THEMES.map((theme: ThemeName) => (
            <button
              key={theme}
              className={`theme-card theme-card-${theme}${settings.theme === theme ? ' theme-card-on' : ''}`}
              onClick={() => void patch({ theme })}
              aria-pressed={settings.theme === theme}
            >
              <span className="theme-dot" aria-hidden="true" />
              {THEME_LABEL[theme]}
            </button>
          ))}
        </div>
      </section>

      <section className="look-section">
        <div className="look-row">
          <span className="look-label">字号</span>
          <div className="size-stepper">
            <button onClick={() => sizeStep(-1)} aria-label="减小字号">
              A−
            </button>
            <span className="size-value">{settings.fontSize}px</span>
            <button onClick={() => sizeStep(1)} aria-label="增大字号">
              A+
            </button>
          </div>
        </div>
        <div className="look-row">
          <span className="look-label">行距</span>
          <input
            className="look-range"
            type="range"
            min={LIMITS.lineHeight.min}
            max={LIMITS.lineHeight.max}
            step={0.1}
            value={settings.lineHeight}
            onChange={(event) => void patch({ lineHeight: Number(event.target.value) })}
            aria-label="行距"
          />
          <span className="look-value">{settings.lineHeight.toFixed(1)}</span>
        </div>
        <div className="look-row">
          <span className="look-label">版心</span>
          <input
            className="look-range"
            type="range"
            min={LIMITS.measure.min}
            max={LIMITS.measure.max}
            step={20}
            value={settings.measure}
            onChange={(event) => void patch({ measure: Number(event.target.value) })}
            aria-label="版心宽度"
          />
          <span className="look-value">{settings.measure}</span>
        </div>
      </section>

      <section className="look-section">
        <p className="look-label">字族</p>
        <div className="look-fonts">
          {(Object.keys(FONT_LABEL) as FontStack[]).map((font) => (
            <button
              key={font}
              className={`font-card${settings.font === font ? ' font-card-on' : ''}`}
              onClick={() => void patch({ font })}
              aria-pressed={settings.font === font}
            >
              {FONT_LABEL[font]}
            </button>
          ))}
        </div>
      </section>

      <button
        className="look-reset"
        onClick={() =>
          void patch({
            theme: DEFAULT_SETTINGS.theme,
            fontSize: DEFAULT_SETTINGS.fontSize,
            lineHeight: DEFAULT_SETTINGS.lineHeight,
            measure: DEFAULT_SETTINGS.measure,
            font: DEFAULT_SETTINGS.font
          })
        }
      >
        恢复默认版式
      </button>
    </div>
  )
}
