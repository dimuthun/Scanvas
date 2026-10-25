import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, ImagePlus, QrCode, RefreshCw, Save, ScanLine, ScanText, WrapText } from 'lucide-react'
import { paragraphsToText } from '@shared/ocrText'
import { OCR_LANGUAGES, type OcrLanguage, type ResultState } from '@shared/types'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import { EmptyState, IconButton, Switch } from '../ui/controls'
import { toast } from '../ui/toast'
import { decodeCodes, isWebLink, type DecodedCode } from './codes'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/bmp', 'image/webp', 'image/gif']

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ResultPage(): React.JSX.Element {
  const t = useTranslator()
  const [state, setState] = useState<ResultState | null>(null)
  const [text, setText] = useState('')
  const [reflow, setReflow] = useState(false)
  const [languages, setLanguages] = useState<OcrLanguage[]>([])
  const [codes, setCodes] = useState<DecodedCode[]>([])
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    void window.api.getResult().then((s) => s && setState(s))
    return window.api.onResultUpdate(setState)
  }, [])

  useEffect(() => {
    document.title = t('resultTitle')
  }, [t])

  // Reset the editor whenever a new recognition result arrives (not when `reflow` toggles — that has its own handler).
  const reflowRef = useRef(reflow)
  reflowRef.current = reflow
  useEffect(() => {
    if (!state) return
    setLanguages(state.languages)
    if (state.status === 'done' && state.result) setText(paragraphsToText(state.result.paragraphs, reflowRef.current))
    if (state.status === 'loading') setText('')
  }, [state])

  const image = state?.image
  useEffect(() => {
    setCodes([])
    if (!image) return
    let stale = false
    decodeCodes(image)
      .then((found) => !stale && setCodes(found))
      .catch((error: unknown) => console.warn('barcode decoding failed', error))
    return () => {
      stale = true
    }
  }, [image])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => IMAGE_TYPES.includes(f.type))
      if (!file) return
      event.preventDefault()
      void readAsDataUrl(file).then((url) => window.api.submitImage(url))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const copy = async (value = text): Promise<void> => {
    await window.api.copyText(value)
    toast(t('resultCopied'))
  }

  const toggleReflow = (next: boolean): void => {
    setReflow(next)
    if (state?.result) setText(paragraphsToText(state.result.paragraphs, next))
  }

  const toggleLanguage = (lang: OcrLanguage): void => {
    setLanguages((current) =>
      current.includes(lang) ? (current.length > 1 ? current.filter((l) => l !== lang) : current) : [...current, lang]
    )
  }

  const onDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    setDragOver(false)
    const file = [...event.dataTransfer.files].find((f) => IMAGE_TYPES.includes(f.type))
    if (file) await window.api.submitImage(await readAsDataUrl(file))
  }

  const loading = state?.status === 'loading'
  const languagesChanged = state ? languages.join('+') !== state.languages.join('+') : false

  return (
    <AppShell
      title={t('resultTitle')}
      actions={
        <>
          <IconButton icon={ScanLine} label={t('resultNewCapture')} onClick={() => void window.api.startCapture()} />
          <IconButton icon={ImagePlus} label={t('resultOpenImage')} onClick={() => void window.api.openImage()} />
          <button className="sm" disabled={!image} onClick={() => void window.api.resultToLibrary()}>
            <ScanText /> {t('resultOpenInScanner')}
          </button>
        </>
      }
    >
      <div
        className={`result-page${dragOver ? ' drag-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => void onDrop(event)}
      >
        <section className="pane image-pane card">
          {image ? <img src={image} alt="" /> : <EmptyState title={t('resultDropHint')} />}
          {loading && <div className="scan-sweep" aria-hidden />}
        </section>

        <section className="pane text-pane card">
          <div className="lang-bar">
            <span className="muted">{t('resultLanguages')}</span>
            {OCR_LANGUAGES.map((lang) => (
              <button
                key={lang}
                className={`chip${languages.includes(lang) ? ' active' : ''}`}
                disabled={loading || !state}
                onClick={() => toggleLanguage(lang)}
              >
                {languages.includes(lang) && <Check />}
                {t(`lang_${lang}`)}
              </button>
            ))}
            <div className="spacer" />
            <button className={`sm${languagesChanged ? ' primary' : ''}`} disabled={!state || loading} onClick={() => void window.api.rerunOcr(languages)}>
              <RefreshCw /> {t('resultRerun')}
            </button>
          </div>

          {codes.length > 0 && (
            <div className="codes">
              <h2 className="panel-title">
                <QrCode /> {t('resultCodes')}
              </h2>
              {codes.map((code) => (
                <div key={`${code.format}:${code.text}`} className="code-row">
                  <span className="badge accent">{code.format}</span>
                  <span className="value" title={code.text}>
                    {code.text}
                  </span>
                  <IconButton icon={Copy} small label={t('resultCopy')} onClick={() => void copy(code.text)} />
                  {isWebLink(code.text) && <IconButton icon={ExternalLink} small label={t('resultOpenLink')} onClick={() => void window.api.openExternal(code.text.trim())} />}
                </div>
              ))}
            </div>
          )}

          <div className="text-wrap">
            <textarea value={text} onChange={(event) => setText(event.target.value)} disabled={loading} spellCheck={false} aria-label={t('resultTitle')} />
            {loading && (
              <div className="text-status">
                <span className="spinner" /> {t('resultRecognizing')}
              </div>
            )}
            {state?.status === 'error' && <div className="text-status error">{t('resultError')}</div>}
            {state?.status === 'done' && !state.result?.text && <div className="text-status">{t('resultEmpty')}</div>}
          </div>

          <footer className="actions">
            <Switch checked={reflow} onChange={toggleReflow} disabled={!state?.result}>
              <WrapText className="inline-icon" /> {t('resultReflow')}
            </Switch>
            {state?.status === 'done' && state.result && <span className="badge">{t('resultConfidence', { value: state.result.confidence })}</span>}
            <div className="spacer" />
            <button disabled={!text} onClick={() => void window.api.saveText(text)}>
              <Save /> {t('resultSave')}
            </button>
            <button className="primary" disabled={!text} onClick={() => void copy()}>
              <Copy /> {t('resultCopy')}
            </button>
          </footer>
        </section>
      </div>
    </AppShell>
  )
}
