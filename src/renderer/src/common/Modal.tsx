import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from '@shared/i18n'

interface PromptRequest {
  title: string
  label?: string
  initial: string
  hint?: string
  resolve(value: string | null): void
}

/**
 * Electron does not implement window.prompt(), so text input uses this modal.
 * Usage: const [modal, prompt] = usePrompt(t); … const name = await prompt({ title })
 */
export function usePrompt(t: Translate): [ReactNode, (options: { title: string; label?: string; initial?: string; hint?: string }) => Promise<string | null>] {
  const [request, setRequest] = useState<PromptRequest | null>(null)
  const prompt = useCallback(
    (options: { title: string; label?: string; initial?: string; hint?: string }) =>
      new Promise<string | null>((resolve) => setRequest({ ...options, initial: options.initial ?? '', resolve })),
    []
  )
  const close = (value: string | null): void => {
    request?.resolve(value)
    setRequest(null)
  }
  const element = request ? <PromptDialog key={request.title + request.initial} request={request} t={t} onClose={close} /> : null
  return [element, prompt]
}

function PromptDialog({ request, t, onClose }: { request: PromptRequest; t: Translate; onClose(value: string | null): void }): React.JSX.Element {
  const [value, setValue] = useState(request.initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <Modal title={request.title} onClose={() => onClose(null)}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onClose(value.trim() ? value : null)
        }}
      >
        <label className="field">
          {request.label && <span>{request.label}</span>}
          <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} />
          {request.hint && <small>{request.hint}</small>}
        </label>
        <div className="modal-actions">
          <button type="button" onClick={() => onClose(null)}>
            {t('commonCancel')}
          </button>
          <button type="submit" className="primary">
            {t('commonOk')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
