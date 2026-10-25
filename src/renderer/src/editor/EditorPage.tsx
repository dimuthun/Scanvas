import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen,
  Copy,
  Crop,
  Eraser,
  FileDown,
  FileImage,
  FileStack,
  FileText,
  FileType,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  IdCard,
  Image as ImageIcon,
  Images,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  ScanText,
  Sparkles,
  SunMedium,
  Trash2,
  Undo2,
  Wand2,
  type LucideIcon
} from 'lucide-react'
import type { ImportProgress } from '@shared/api'
import { defaultParams, pageAssetUrl } from '@shared/pageMath'
import { FILTERS, type DocumentDetail, type FilterName, type PageParams, type PageRecord, type PageSource, type Quad } from '@shared/types'
import { Dropdown } from '../common/Dropdown'
import { queryParam, useAppInfo, useLibraryRefresh, useSettings } from '../common/hooks'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import { IconButton, Segmented, Slider, SkeletonImage, Switch } from '../ui/controls'
import { toast } from '../ui/toast'
import { CornerEditor, cornersOrFull } from './CornerEditor'
import { PdfOptionsDialog } from './PdfOptionsDialog'

const docId = queryParam('doc') ?? ''
const PAGE_DRAG = 'application/x-scanvas-page'

const FILTER_ICONS: Record<FilterName, LucideIcon> = {
  original: ImageIcon,
  magic: Sparkles,
  gray: SunMedium,
  bw: FileText
}

type View = 'result' | 'crop'

export function EditorPage(): React.JSX.Element {
  const t = useTranslator()
  const info = useAppInfo()
  const settings = useSettings()
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('result')
  const [draftCorners, setDraftCorners] = useState<Quad | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [title, setTitle] = useState('')
  const [pdfDialog, setPdfDialog] = useState(false)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const load = useCallback(() => {
    void window.api.getDocument(docId).then((d) => {
      if (!d) {
        window.close()
        return
      }
      setDetail(d)
      setSelectedId((current) => (current && d.pages.some((p) => p.id === current) ? current : (d.pages[0]?.id ?? null)))
    })
  }, [])
  useLibraryRefresh(load, docId)

  useEffect(() => window.api.onImportProgress((p) => p.docId === docId && setProgress(p.done >= p.total ? null : p)), [])

  const document_ = detail?.document
  useEffect(() => {
    if (document_) {
      setTitle(document_.title)
      document.title = `${document_.title} — Scanvas`
    }
  }, [document_?.title])

  const pages = detail?.pages ?? []
  const page = pages.find((p) => p.id === selectedId) ?? null

  /** Run a page command, showing a busy indicator on that page until it finishes. */
  const run = async (pageId: string, task: () => Promise<unknown>): Promise<void> => {
    setBusy((b) => new Set(b).add(pageId))
    try {
      await task()
    } catch (error) {
      console.error(error)
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(pageId)
        return next
      })
    }
  }

  const setParams = (patch: Partial<PageParams>): void => {
    if (page) void run(page.id, () => window.api.setPageParams(page.id, patch))
  }

  const commitTitle = (): void => {
    const value = title.trim()
    if (document_ && value && value !== document_.title) void window.api.updateDocument(docId, { title: value })
    else if (document_) setTitle(document_.title)
  }

  const addPages = (source: PageSource): void => void window.api.addPages(docId, source)

  const switchView = (next: View): void => {
    if (next === 'crop' && page) setDraftCorners(cornersOrFull(page.params.corners))
    setView(next)
  }

  const applyCrop = (): void => {
    if (!page || !draftCorners) return
    const full = draftCorners.every((p, i) => Math.abs(p.x - [0, 1, 1, 0][i]) < 0.002 && Math.abs(p.y - [0, 0, 1, 1][i]) < 0.002)
    setParams({ corners: full ? null : draftCorners, crop: null })
    setView('result')
  }

  const autoDetect = async (): Promise<void> => {
    if (!page) return
    await run(page.id, () => window.api.detectPage(page.id))
    const fresh = (await window.api.getDocument(docId))?.pages.find((p) => p.id === page.id)
    if (fresh) setDraftCorners(cornersOrFull(fresh.params.corners))
  }

  const removePage = (target: PageRecord): void => {
    if (window.confirm(t('editorDeletePageConfirm'))) void window.api.deletePage(target.id)
  }

  const exportAs = (format: 'docx' | 'images' | 'txt'): void => void window.api.exportDocument(docId, format)
  const pdf = settings?.pdf
  const noPages = pages.length === 0

  const addItems = [
    { label: t('libraryFromImages'), icon: Images, onSelect: () => addPages('images') },
    { label: t('libraryFromFolder'), icon: FolderOpen, onSelect: () => addPages('folder') },
    { label: t('libraryFromPdf'), icon: FileStack, onSelect: () => addPages('pdf') },
    { label: t('libraryFromScanner'), icon: Printer, onSelect: () => addPages('scanner'), hidden: info?.platform !== 'win32' }
  ]

  return (
    <AppShell
      title={title}
      titleSlot={
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={t('libraryTitleLabel')}
        />
      }
      center={
        progress && (
          <span className="import-pill">
            <span className="spinner small" /> {t('editorImporting', { done: progress.done, total: progress.total })}
          </span>
        )
      }
      actions={
        <>
          <Dropdown label={t('editorAddPages')} icon={Plus} items={addItems} triggerClass="sm" />
          <IconButton icon={Printer} label={t('editorPrint')} disabled={noPages || !pdf} onClick={() => pdf && void window.api.printDocument(docId, pdf.paper, pdf.marginMm)} />
          <Dropdown
            label={t('editorExport')}
            icon={FileDown}
            primary
            align="right"
            triggerClass="sm"
            items={[
              { label: t('editorExportPdf'), icon: FileType, onSelect: () => setPdfDialog(true), disabled: noPages },
              { label: t('editorExportWord'), icon: FileText, onSelect: () => exportAs('docx'), disabled: noPages },
              { label: t('editorExportImages'), icon: FileImage, onSelect: () => exportAs('images'), disabled: noPages },
              { label: t('editorExportText'), icon: Copy, onSelect: () => exportAs('txt'), disabled: noPages }
            ]}
          />
        </>
      }
    >
      <div className="editor-body">
        <aside className="page-strip glass">
          {pages.map((p, index) => (
            <div
              key={p.id}
              className={`strip-item${p.id === selectedId ? ' selected' : ''}${dropIndex === index ? ' drop-before' : ''}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(PAGE_DRAG, p.id)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(PAGE_DRAG)) return
                e.preventDefault()
                setDropIndex(index)
              }}
              onDragLeave={() => setDropIndex((d) => (d === index ? null : d))}
              onDrop={(e) => {
                e.preventDefault()
                setDropIndex(null)
                const moved = e.dataTransfer.getData(PAGE_DRAG)
                const from = pages.findIndex((x) => x.id === moved)
                if (moved && from !== index) void window.api.movePage(moved, from < index ? index - 1 : index)
              }}
              onClick={() => {
                setSelectedId(p.id)
                setView('result')
              }}
            >
              <div className="strip-thumb">
                <SkeletonImage src={pageAssetUrl(p, 'thumb')} />
                <span className="page-number">{index + 1}</span>
                <span className={`ocr-dot ${p.ocrStatus}`} title={p.ocrStatus} />
                {busy.has(p.id) && <span className="strip-busy spinner small" />}
                <span className="strip-delete">
                  <IconButton
                    icon={Trash2}
                    small
                    label={t('editorDeletePage')}
                    onClick={(e) => {
                      e.stopPropagation()
                      removePage(p)
                    }}
                  />
                </span>
              </div>
            </div>
          ))}
          <div
            className={`strip-end${dropIndex === pages.length ? ' drop-before' : ''}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(PAGE_DRAG)) return
              e.preventDefault()
              setDropIndex(pages.length)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDropIndex(null)
              const moved = e.dataTransfer.getData(PAGE_DRAG)
              if (moved) void window.api.movePage(moved, pages.length - 1)
            }}
          >
            <Dropdown icon={Plus} ariaLabel={t('editorAddPages')} items={addItems} triggerClass="add-page" />
          </div>
        </aside>

        <main className="viewer">
          {!page && !progress && (
            <div className="viewer-empty">
              <h2>{t('editorNoPages')}</h2>
              <div className="row">
                <button className="primary" onClick={() => addPages('images')}>
                  <Images /> {t('libraryFromImages')}
                </button>
                <button onClick={() => addPages('pdf')}>
                  <FileStack /> {t('libraryFromPdf')}
                </button>
                {info?.platform === 'win32' && (
                  <button onClick={() => addPages('scanner')}>
                    <Printer /> {t('libraryFromScanner')}
                  </button>
                )}
              </div>
            </div>
          )}
          {page && (
            <>
              <div className="view-tabs">
                <Segmented<View>
                  value={view}
                  onChange={switchView}
                  options={[
                    { value: 'result', label: t('editorViewResult'), icon: Sparkles },
                    { value: 'crop', label: t('editorViewCrop'), icon: Crop }
                  ]}
                />
              </div>
              <div className="canvas">
                {view === 'result' ? (
                  <img key={page.version} className="processed" src={pageAssetUrl(page, 'processed')} alt={t('editorPage', { n: page.index + 1 })} />
                ) : (
                  draftCorners && (
                    <CornerEditor imageUrl={pageAssetUrl(page, 'original')} width={page.width} height={page.height} corners={draftCorners} onChange={setDraftCorners} />
                  )
                )}
                {busy.has(page.id) && (
                  <div className="busy">
                    <span className="spinner small" /> {t('editorProcessing')}
                  </div>
                )}
              </div>
              {view === 'crop' && (
                <div className="crop-bar glass">
                  <span className="muted">{t('editorDragHint')}</span>
                  <div className="spacer" />
                  <button className="sm" onClick={() => void autoDetect()}>
                    <Wand2 /> {t('editorAutoDetect')}
                  </button>
                  <button className="sm" onClick={() => setDraftCorners(cornersOrFull(null))}>
                    {t('editorFullImage')}
                  </button>
                  <button className="sm" onClick={() => setView('result')}>
                    {t('commonCancel')}
                  </button>
                  <button className="sm primary" onClick={applyCrop}>
                    <Crop /> {t('editorApplyCrop')}
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {page ? (
          <SidePanel key={`${page.id}:${page.version}`} page={page} t={t} run={run} setParams={setParams} />
        ) : (
          <aside className="side-panel glass" />
        )}
      </div>

      <footer className="editor-status">
        <span className="badge">
          <IdCard /> {t('editorLayout')}
        </span>
        <Segmented<'pages' | 'idcard'>
          value={document_?.layout ?? 'pages'}
          onChange={(layout) => void window.api.updateDocument(docId, { layout })}
          options={[
            { value: 'pages', label: t('editorLayoutPages'), icon: BookOpen },
            { value: 'idcard', label: t('editorLayoutIdCard'), icon: IdCard }
          ]}
        />
        <div className="spacer" />
        <span className="muted">{pages.length > 0 && (pages.length === 1 ? t('libraryPageOne') : t('libraryPages', { count: pages.length }))}</span>
      </footer>

      {pdfDialog && pdf && (
        <PdfOptionsDialog
          t={t}
          initial={pdf}
          onClose={(options) => {
            setPdfDialog(false)
            if (options) {
              void window.api.updateSettings({ pdf: options })
              void window.api.exportDocument(docId, 'pdf', options)
            }
          }}
        />
      )}
    </AppShell>
  )
}

interface SidePanelProps {
  page: PageRecord
  t: ReturnType<typeof useTranslator>
  run(pageId: string, task: () => Promise<unknown>): Promise<void>
  setParams(patch: Partial<PageParams>): void
}

/** Filters and per-page tools. Re-mounted per page version so controls reflect the stored recipe. */
function SidePanel({ page, t, run, setParams }: SidePanelProps): React.JSX.Element {
  const { params } = page

  const commit = (patch: Partial<PageParams>): void => {
    const changed = Object.entries(patch).some(([key, value]) => params[key as keyof PageParams] !== value)
    if (changed) setParams(patch)
  }
  const command = (task: (id: string) => Promise<void>) => () => void run(page.id, () => task(page.id))

  const copy = async (): Promise<void> => {
    if (!page.ocrText) return
    await window.api.copyText(page.ocrText)
    toast(t('resultCopied'))
  }

  return (
    <aside className="side-panel glass">
      <section>
        <h2 className="panel-title">
          <Sparkles /> {t('editorFilters')}
        </h2>
        <div className="filters">
          {FILTERS.map((filter) => {
            const Icon = FILTER_ICONS[filter]
            return (
              <button key={filter} className={`filter-chip${params.filter === filter ? ' active' : ''}`} onClick={() => commit({ filter })}>
                <span className={`filter-swatch ${filter}`}>
                  <Icon />
                </span>
                {t(`filter_${filter}`)}
              </button>
            )
          })}
        </div>
        {(params.filter === 'original' || params.filter === 'gray') && (
          <div className="switch-row">
            <Switch checked={params.removeShadows} onChange={(removeShadows) => commit({ removeShadows })}>
              <Eraser className="inline-icon" /> {t('editorRemoveShadows')}
            </Switch>
          </div>
        )}
      </section>

      <section>
        <h2 className="panel-title">
          <SunMedium /> {t('editorAdjust')}
        </h2>
        <Slider label={t('editorBrightness')} value={params.brightness} min={-100} max={100} onCommit={(brightness) => commit({ brightness })} />
        <Slider label={t('editorContrast')} value={params.contrast} min={-100} max={100} onCommit={(contrast) => commit({ contrast })} />
      </section>

      <section>
        <h2 className="panel-title">
          <Wand2 /> {t('editorStraighten')}
        </h2>
        <Slider label={t('editorAngleLabel')} value={params.angle} min={-15} max={15} step={0.1} format={(v) => `${v.toFixed(1)}°`} onCommit={(angle) => commit({ angle })} />
        <div className="tool-grid">
          <button className="sm" onClick={command(window.api.straightenPage)}>
            <Wand2 /> {t('editorAutoStraighten')}
          </button>
          <button className="sm" onClick={command(window.api.autoRotatePage)}>
            <RotateCw /> {t('editorAutoRotate')}
          </button>
        </div>
      </section>

      <section>
        <h2 className="panel-title">
          <Crop /> {t('editorPageTools')}
        </h2>
        <div className="icon-tools">
          <IconButton icon={RotateCcw} label={t('editorRotateLeft')} onClick={command((id) => window.api.rotatePage(id, -90))} />
          <IconButton icon={RotateCw} label={t('editorRotateRight')} onClick={command((id) => window.api.rotatePage(id, 90))} />
          <IconButton icon={FlipHorizontal2} label={t('editorFlipH')} active={params.flipH} onClick={() => commit({ flipH: !params.flipH })} />
          <IconButton icon={FlipVertical2} label={t('editorFlipV')} active={params.flipV} onClick={() => commit({ flipV: !params.flipV })} />
          <IconButton icon={BookOpen} label={t('editorSplit')} disabled={!!params.crop} onClick={command(window.api.splitPage)} />
          <IconButton icon={Undo2} label={t('editorReset')} onClick={() => setParams({ ...defaultParams(params.filter), corners: params.corners })} />
        </div>
      </section>

      <section className="ocr-section">
        <h2 className="panel-title">
          <ScanText /> {t('editorText')}
          {page.ocrStatus === 'done' && <span className="badge accent ocr-badge">OCR</span>}
        </h2>
        {page.ocrStatus === 'pending' && (
          <p className="muted status-line">
            <span className="spinner small" /> {t('editorOcrPending')}
          </p>
        )}
        {page.ocrStatus === 'none' && <p className="muted status-line">{t('editorOcrNone')}</p>}
        {page.ocrStatus === 'error' && <p className="error status-line">{t('editorOcrError')}</p>}
        {page.ocrText && <textarea readOnly value={page.ocrText} />}
        <div className="tool-grid">
          <button className="sm" disabled={!page.ocrText} onClick={() => void copy()}>
            <Copy /> {t('commonCopy')}
          </button>
          <button className="sm" disabled={page.ocrStatus === 'pending'} onClick={command(window.api.ocrPage)}>
            <ScanText /> {t('editorRunOcr')}
          </button>
        </div>
      </section>
    </aside>
  )
}
