import { BrowserWindow, clipboard, desktopCapturer, Notification, screen, type Display } from 'electron'
import { IPC } from '@shared/api'
import { createTranslator } from '@shared/i18n'
import type { CaptureInit } from '@shared/types'
import { decodeImageDataUrl } from './images'
import { recognize } from './ocr'
import { showResult } from './result'
import { getSettings, uiLocale } from './settings'
import { createAppWindow } from './windows'

export type CaptureMode = 'result' | 'quickCopy'

interface CaptureSession {
  mode: CaptureMode
  overlays: BrowserWindow[]
}

let session: CaptureSession | null = null

export function isCapturing(): boolean {
  return session !== null
}

/** Freeze every display and open one selection overlay per display. */
export async function startCapture(mode: CaptureMode): Promise<void> {
  if (session) return
  session = { mode, overlays: [] }
  try {
    const displays = screen.getAllDisplays()
    const thumbnailSize = {
      width: Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor))),
      height: Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor)))
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })

    displays.forEach((display, index) => {
      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[index]
      if (!source || !session) return
      session.overlays.push(openOverlay(display, source.thumbnail.toDataURL()))
    })
    focusOverlayUnderCursor()
  } catch (error) {
    console.error('[capture] failed to capture screen', error)
    closeOverlays()
  }
}

function openOverlay(display: Display, imageUrl: string): BrowserWindow {
  const { bounds } = display
  const overlay = createAppWindow('overlay', {
    chrome: 'plain',
    ...bounds,
    frame: false,
    show: false,
    transparent: false,
    backgroundColor: '#000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    alwaysOnTop: true
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Windows with mixed DPI monitors may apply the wrong scale on creation; re-apply bounds.
  overlay.setBounds(bounds)

  const init: CaptureInit = { imageUrl, width: bounds.width, height: bounds.height, scaleFactor: display.scaleFactor }
  overlay.webContents.once('did-finish-load', () => {
    overlay.webContents.send(IPC.captureInit, init)
    overlay.setBounds(bounds)
    overlay.show()
    focusOverlayUnderCursor()
  })
  overlay.on('closed', () => {
    if (!session) return
    session.overlays = session.overlays.filter((w) => w !== overlay)
    if (session.overlays.length === 0) session = null
  })
  return overlay
}

function focusOverlayUnderCursor(): void {
  if (!session) return
  const cursor = screen.getCursorScreenPoint()
  const target = session.overlays.find((w) => {
    const b = w.getBounds()
    return cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height
  })
  target?.focus()
}

function closeOverlays(): void {
  const overlays = session?.overlays ?? []
  session = null
  for (const overlay of overlays) if (!overlay.isDestroyed()) overlay.close()
}

export function cancelCapture(): void {
  closeOverlays()
}

/** Called by an overlay with the cropped selection; `override` comes from the overlay's "Copy text" button. */
export async function submitCapture(dataUrl: unknown, override?: CaptureMode): Promise<void> {
  const mode = override ?? session?.mode ?? 'result'
  const image = decodeImageDataUrl(dataUrl)
  closeOverlays()
  if (mode === 'result') {
    await showResult(image)
    return
  }
  const t = createTranslator(uiLocale())
  try {
    const result = await recognize(image.bytes, getSettings().ocrLanguages)
    if (result.text) clipboard.writeText(result.text)
    new Notification({
      title: result.text ? t('quickCopyDone') : t('quickCopyEmpty'),
      body: result.text.slice(0, 120),
      silent: true
    }).show()
  } catch (error) {
    console.error('[capture] quick copy failed', error)
    new Notification({ title: t('ocrFailed') }).show()
  }
}
