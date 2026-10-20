import { useUiStore } from '@/store/useUiStore'

export function Toast() {
  const toast = useUiStore((s) => s.toast)
  const clear = useUiStore((s) => s.clearToast)
  if (!toast) return null
  return (
    <div className="toast" role="status" aria-live="polite" onClick={clear}>
      {toast.text}
    </div>
  )
}
