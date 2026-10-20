import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  detail: string
  confirmText?: string
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog({
  title,
  detail,
  confirmText = '删除',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-detail">{detail}</p>
        <div className="confirm-actions">
          <button className="btn-quiet" onClick={onCancel}>
            取消
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
