import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Copy, MousePointer2, ScanText, X } from 'lucide-react'
import { moveRect, rectFromPoints, resizeRect, toImageRect, toolbarPosition, type Handle } from '@shared/geometry'
import type { CaptureInit, Rect } from '@shared/types'
import { useTranslator } from '../common/useTranslator'
import { useTheme } from '../ui/useTheme'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const TOOLBAR = { width: 132, height: 44 }
const MIN_SIZE = 4
const LOUPE = { size: 132, zoom: 8, offset: 22, footer: 34 }

type Drag =
  | { kind: 'create'; x: number; y: number }
  | { kind: 'move'; x: number; y: number }
  | { kind: 'resize'; handle: Handle; x: number; y: number }

type Mode = 'result' | 'quickCopy'

function viewSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function Overlay(): React.JSX.Element {
  const t = useTranslator()
  useTheme()
  const [init, setInit] = useState<CaptureInit | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [overToolbar, setOverToolbar] = useState(false)
  const drag = useRef<Drag | null>(null)
  const image = useRef<HTMLImageElement | null>(null)
  /** Full-resolution copy of the screenshot used for the loupe and pixel colors. */
  const source = useRef<HTMLCanvasElement | null>(null)
  const loupe = useRef<HTMLCanvasElement | null>(null)
  const submitted = useRef(false)
  const [pixel, setPixel] = useState<{ x: number; y: number; hex: string } | null>(null)

  useEffect(() => window.api.onCaptureInit(setInit), [])

  const onImageLoad = (): void => {
    const img = image.current
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0)
    source.current = canvas
  }

  const cancel = useCallback(() => {
    void window.api.cancelCapture()
  }, [])

  const confirm = useCallback(
    (mode?: Mode) => {
      const img = image.current
      if (!rect || !img || submitted.current || rect.width < MIN_SIZE || rect.height < MIN_SIZE) return
      const area = toImageRect(rect, viewSize(), { width: img.naturalWidth, height: img.naturalHeight })
      const canvas = document.createElement('canvas')
      canvas.width = area.width
      canvas.height = area.height
      canvas.getContext('2d')!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
      submitted.current = true
      void window.api.submitCapture(canvas.toDataURL('image/png'), mode)
    },
    [rect]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel()
      else if (event.key === 'Enter') confirm(event.ctrlKey || event.metaKey ? 'quickCopy' : undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, confirm])

  // Paint the magnified pixels around the cursor and read the color under it.
  useEffect(() => {
    const canvas = loupe.current
    const src = source.current
    if (!canvas || !src || !cursor) return
    const scaleX = src.width / window.innerWidth
    const scaleY = src.height / window.innerHeight
    const px = Math.min(src.width - 1, Math.max(0, Math.floor(cursor.x * scaleX)))
    const py = Math.min(src.height - 1, Math.max(0, Math.floor(cursor.y * scaleY)))
    const cells = LOUPE.size / LOUPE.zoom
    const context = canvas.getContext('2d')!
    context.imageSmoothingEnabled = false
    context.fillStyle = '#000'
    context.fillRect(0, 0, LOUPE.size, LOUPE.size)
    context.drawImage(src, px - cells / 2, py - cells / 2, cells, cells, 0, 0, LOUPE.size, LOUPE.size)
    const [r, g, b] = src.getContext('2d')!.getImageData(px, py, 1, 1).data
    setPixel({ x: px, y: py, hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase() })
  }, [cursor])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.toolbar')) return
    const handle = target.dataset['handle'] as Handle | undefined
    const { clientX: x, clientY: y } = event
    if (handle && rect) drag.current = { kind: 'resize', handle, x, y }
    else if (target.closest('.selection') && rect) drag.current = { kind: 'move', x, y }
    else {
      drag.current = { kind: 'create', x, y }
      setRect({ x, y, width: 0, height: 0 })
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const { clientX: x, clientY: y } = event
    setCursor({ x, y })
    const current = drag.current
    if (!current) return
    const bounds = viewSize()
    if (current.kind === 'create') {
      setRect(rectFromPoints(current.x, current.y, Math.min(Math.max(x, 0), bounds.width), Math.min(Math.max(y, 0), bounds.height)))
      return
    }
    const dx = x - current.x
    const dy = y - current.y
    current.x = x
    current.y = y
    setRect((r) => r && (current.kind === 'move' ? moveRect(r, dx, dy, bounds) : resizeRect(r, current.handle, dx, dy, bounds)))
  }

  const onPointerUp = (): void => {
    drag.current = null
    setDragging(false)
    setRect((r) => (r && r.width >= MIN_SIZE && r.height >= MIN_SIZE ? r : null))
  }

  const onContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault()
    // Right-click clears the selection first, then cancels — same as the original app.
    if (rect) setRect(null)
    else cancel()
  }

  if (!init) return <div className="overlay loading" />

  const toolbar = rect && !dragging ? toolbarPosition(rect, TOOLBAR, viewSize()) : null
  const physical = rect ? `${Math.round(rect.width * init.scaleFactor)} × ${Math.round(rect.height * init.scaleFactor)}` : ''
  const showLoupe = cursor && !overToolbar && (dragging || !rect)
  const loupeHeight = LOUPE.size + LOUPE.footer
  const loupePosition = cursor && {
    left: cursor.x + LOUPE.offset + LOUPE.size > window.innerWidth ? cursor.x - LOUPE.offset - LOUPE.size : cursor.x + LOUPE.offset,
    top: cursor.y + LOUPE.offset + loupeHeight > window.innerHeight ? cursor.y - LOUPE.offset - loupeHeight : cursor.y + LOUPE.offset
  }

  return (
    <div
      className={`overlay${rect ? '' : ' empty'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setCursor(null)}
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('.selection')) confirm()
      }}
    >
      <img ref={image} className="screenshot" src={init.imageUrl} alt="" draggable={false} onLoad={onImageLoad} />
      {!rect && (
        <div className="hint">
          <MousePointer2 /> {t('overlayHint')}
        </div>
      )}
      {rect && (
        <div className={`selection${dragging ? ' dragging' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
          <div className="size-label" style={rect.y < 30 ? { top: 6 } : undefined}>
            {physical}
          </div>
          {!dragging && HANDLES.map((handle) => <div key={handle} className={`handle ${handle}`} data-handle={handle} />)}
        </div>
      )}
      {toolbar && (
        <div
          className="toolbar"
          style={{ left: toolbar.x, top: toolbar.y, width: TOOLBAR.width, height: TOOLBAR.height }}
          onPointerEnter={() => setOverToolbar(true)}
          onPointerLeave={() => setOverToolbar(false)}
        >
          <button className="tool cancel" data-tooltip={t('overlayCancel')} aria-label={t('overlayCancel')} onClick={cancel}>
            <X />
          </button>
          <button className="tool" data-tooltip={t('overlayCopy')} aria-label={t('overlayCopy')} onClick={() => confirm('quickCopy')}>
            <Copy />
          </button>
          <button className="tool confirm" data-tooltip={t('overlayConfirm')} aria-label={t('overlayConfirm')} onClick={() => confirm('result')}>
            <ScanText />
          </button>
        </div>
      )}
      {showLoupe && loupePosition && (
        <div className="loupe" style={{ left: loupePosition.left, top: loupePosition.top, width: LOUPE.size }}>
          <canvas ref={loupe} width={LOUPE.size} height={LOUPE.size} />
          <div className="loupe-cross" />
          {pixel && (
            <div className="loupe-info">
              <span>{t('overlayCoordinates', { x: pixel.x, y: pixel.y })}</span>
              <span className="color">
                <i style={{ background: pixel.hex }} />
                {pixel.hex}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
