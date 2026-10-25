import { useEffect, useRef, useState } from 'react'
import { Check, Combine, FilePlus2, Info, RotateCw, Scissors, Trash2, X } from 'lucide-react'
import type { Translate } from '@shared/i18n'
import { parseRanges, splitEvery } from '@shared/pageMath'
import type { PdfToolPage, Rotation, SplitMode } from '@shared/types'
import { Modal } from '../common/Modal'
import { loadPdf, renderPdfPage, type PdfDocument } from '../common/pdf'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import { EmptyState, IconButton } from '../ui/controls'

interface GridPage extends PdfToolPage {
  key: string
}

interface OpenFile {
  fileId: string
  name: string
  doc: PdfDocument
}

const THUMB_SCALE = 0.3

/** Lazily rendered page thumbnail (pdf.js), re-rendered when the extra rotation changes. */
function Thumbnail({ doc, pageIndex, rotation }: { doc: PdfDocument; pageIndex: number; rotation: Rotation }): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const element = holder.current!
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const canvas = await renderPdfPage(doc, pageIndex, THUMB_SCALE, rotation)
      if (cancelled) return
      element.replaceChildren(canvas)
      element.classList.remove('skeleton')
    })
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [doc, pageIndex, rotation])
  return <div className="pdf-thumb skeleton" ref={holder} />
}

function SplitDialog({ t, pageCount, onClose }: { t: Translate; pageCount: number; onClose(mode: SplitMode | null): void }): React.JSX.Element {
  const [kind, setKind] = useState<SplitMode['kind']>('every')
  const [size, setSize] = useState(1)
  const [ranges, setRanges] = useState('')
  let error: string | null = null
  let fileCount = 0
  try {
    fileCount = (kind === 'every' ? splitEvery(size, pageCount) : parseRanges(ranges, pageCount)).length
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  return (
    <Modal title={t('pdfToolsSplitBy')} onClose={() => onClose(null)}>
      <label className="check-row">
        <input type="radio" checked={kind === 'every'} onChange={() => setKind('every')} />
        {t('pdfToolsSplitEvery')}
      </label>
      {kind === 'every' && (
        <label className="field indent">
          <span>{t('pdfToolsPagesPerFile')}</span>
          <input type="number" min={1} max={pageCount} value={size} onChange={(e) => setSize(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
        </label>
      )}
      <label className="check-row">
        <input type="radio" checked={kind === 'ranges'} onChange={() => setKind('ranges')} />
        {t('pdfToolsSplitRanges')}
      </label>
      {kind === 'ranges' && (
        <label className="field indent">
          <input value={ranges} placeholder={t('pdfToolsRangesHint')} onChange={(e) => setRanges(e.target.value)} autoFocus />
        </label>
      )}
      <p className={error && (kind === 'every' || ranges) ? 'error' : 'muted'}>{error && (kind === 'every' || ranges) ? error : `→ ${fileCount} PDF`}</p>
      <div className="modal-actions">
        <button onClick={() => onClose(null)}>{t('commonCancel')}</button>
        <button className="primary" disabled={!!error} onClick={() => onClose(kind === 'every' ? { kind, size } : { kind, ranges })}>
          {t('pdfToolsSplit').replace('…', '')}
        </button>
      </div>
    </Modal>
  )
}

export function PdfToolsPage(): React.JSX.Element {
  const t = useTranslator()
  const [files, setFiles] = useState<OpenFile[]>([])
  const [pages, setPages] = useState<GridPage[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [name, setName] = useState('merged')
  const [splitting, setSplitting] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  useEffect(() => {
    document.title = t('pdfToolsTitle')
  }, [t])

  const addFiles = async (): Promise<void> => {
    const opened = await window.api.openPdfFiles()
    if (opened.length === 0) return
    const loaded = await Promise.all(opened.map(async (file) => ({ fileId: file.fileId, name: file.name, doc: await loadPdf(file.bytes), pageCount: file.pageCount })))
    if (files.length === 0) setName(loaded.length === 1 ? loaded[0].name : 'merged')
    setFiles((current) => [...current, ...loaded])
    setPages((current) => [
      ...current,
      ...loaded.flatMap((file) =>
        Array.from({ length: file.pageCount }, (_, pageIndex) => ({ key: `${file.fileId}:${pageIndex}`, fileId: file.fileId, pageIndex, rotation: 0 as Rotation }))
      )
    ])
  }

  const clearAll = (): void => {
    for (const file of files) {
      void file.doc.loadingTask.destroy()
      void window.api.closePdfFile(file.fileId)
    }
    setFiles([])
    setPages([])
    setSelected(new Set())
  }

  const select = (key: string, event: React.MouseEvent): void => {
    if (event.shiftKey && anchor) {
      const a = pages.findIndex((p) => p.key === anchor)
      const b = pages.findIndex((p) => p.key === key)
      setSelected(new Set(pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.key)))
      return
    }
    setAnchor(key)
    setSelected((current) => {
      if (!(event.ctrlKey || event.metaKey)) return new Set([key])
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rotateSelected = (): void =>
    setPages((current) => current.map((p) => (selected.has(p.key) ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p)))

  const removeSelected = (): void => {
    setPages((current) => current.filter((p) => !selected.has(p.key)))
    setSelected(new Set())
  }

  const drop = (index: number): void => {
    setDropIndex(null)
    if (!dragKey) return
    // Move the dragged page, or the whole selection if the dragged page is selected.
    const moving = selected.has(dragKey) ? pages.filter((p) => selected.has(p.key)) : pages.filter((p) => p.key === dragKey)
    const movingKeys = new Set(moving.map((p) => p.key))
    const before = pages.slice(0, index).filter((p) => !movingKeys.has(p.key))
    const after = pages.slice(index).filter((p) => !movingKeys.has(p.key))
    setPages([...before, ...moving, ...after])
    setDragKey(null)
  }

  const plain = (list: GridPage[]): PdfToolPage[] => list.map(({ fileId, pageIndex, rotation }) => ({ fileId, pageIndex, rotation }))
  const docOf = (fileId: string): PdfDocument | undefined => files.find((f) => f.fileId === fileId)?.doc

  return (
    <AppShell
      title={t('pdfToolsTitle')}
      center={
        selected.size > 0 && (
          <div className="selection-bar">
            <span className="badge accent">{t('pdfToolsSelected', { count: selected.size })}</span>
            <button className="sm" onClick={rotateSelected}>
              <RotateCw /> {t('pdfToolsRotate')}
            </button>
            <button className="sm danger" onClick={removeSelected}>
              <Trash2 /> {t('pdfToolsDelete')}
            </button>
          </div>
        )
      }
      actions={
        <button className="sm primary" onClick={() => void addFiles()}>
          <FilePlus2 /> {t('pdfToolsOpen')}
        </button>
      }
    >
      {pages.length === 0 ? (
        <EmptyState title={t('pdfToolsTitle')} description={t('pdfToolsEmpty')}>
          <button className="primary" onClick={() => void addFiles()}>
            <FilePlus2 /> {t('pdfToolsOpen')}
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="pdf-actions glass">
            <span className="muted hint">
              <Info /> {t('pdfToolsHint')}
            </span>
            <div className="spacer" />
            <span className="badge">{t('pdfToolsPageCount', { count: pages.length })}</span>
            <label className="name-field">
              <span className="muted">{t('pdfToolsName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <IconButton icon={X} label={t('pdfToolsClear')} onClick={clearAll} />
            <button className="sm" onClick={() => setSplitting(true)}>
              <Scissors /> {t('pdfToolsSplit')}
            </button>
            <button className="sm primary" disabled={!name.trim()} onClick={() => void window.api.savePdfPages(plain(pages), name.trim())}>
              <Combine /> {t('pdfToolsSave')}
            </button>
          </div>
          <div className="pdf-grid" onClick={(e) => e.target === e.currentTarget && setSelected(new Set())}>
            {pages.map((page, index) => {
              const doc = docOf(page.fileId)
              return (
                <figure
                  key={page.key}
                  className={`pdf-page${selected.has(page.key) ? ' selected' : ''}${dropIndex === index ? ' drop-before' : ''}`}
                  style={{ animationDelay: `${Math.min(index, 20) * 15}ms` }}
                  draggable
                  onDragStart={() => setDragKey(page.key)}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropIndex(index)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    drop(index)
                  }}
                  onClick={(e) => select(page.key, e)}
                >
                  <div className="pdf-thumb-wrap">
                    {doc && <Thumbnail doc={doc} pageIndex={page.pageIndex} rotation={page.rotation} />}
                    <span className="page-number">{index + 1}</span>
                    {selected.has(page.key) && (
                      <span className="check">
                        <Check />
                      </span>
                    )}
                  </div>
                  <figcaption title={files.find((f) => f.fileId === page.fileId)?.name}>
                    {files.find((f) => f.fileId === page.fileId)?.name} · p{page.pageIndex + 1}
                  </figcaption>
                </figure>
              )
            })}
            <div
              className={`pdf-end${dropIndex === pages.length ? ' drop-before' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDropIndex(pages.length)
              }}
              onDrop={(e) => {
                e.preventDefault()
                drop(pages.length)
              }}
            >
              <button className="add-more" onClick={() => void addFiles()} aria-label={t('pdfToolsOpen')}>
                <FilePlus2 />
              </button>
            </div>
          </div>
        </>
      )}

      {splitting && (
        <SplitDialog
          t={t}
          pageCount={pages.length}
          onClose={(mode) => {
            setSplitting(false)
            if (mode) void window.api.splitPdfPages(plain(pages), mode, name.trim() || 'split')
          }}
        />
      )}
    </AppShell>
  )
}
