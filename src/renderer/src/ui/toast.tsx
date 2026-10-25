import { useSyncExternalStore } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface Toast {
  id: number
  message: string
  kind: 'success' | 'error'
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((listener) => listener())

/** Show a short notification at the bottom of the window. */
export function toast(message: string, kind: Toast['kind'] = 'success', durationMs = 2200): void {
  const id = nextId++
  toasts = [...toasts, { id, message, kind }]
  emit()
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, durationMs)
}

export function ToastHost(): React.JSX.Element {
  const items = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts
  )
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`}>
          {item.kind === 'success' ? <CheckCircle2 /> : <AlertCircle />}
          {item.message}
        </div>
      ))}
    </div>
  )
}
