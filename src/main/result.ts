import { clipboard, type BrowserWindow } from 'electron'
import { IPC } from '@shared/api'
import { createTranslator } from '@shared/i18n'
import type { OcrLanguage, ResultState } from '@shared/types'
import type { DecodedImage } from './images'
import { recognize } from './ocr'
import { getSettings, uiLocale } from './settings'
import { createAppWindow } from './windows'

let win: BrowserWindow | null = null
let state: ResultState | null = null
let imageBytes: Buffer | null = null
let imageMime = 'image/png'
/** Incremented per run so a slow, superseded OCR job cannot overwrite a newer result. */
let runId = 0

export function getResultState(): ResultState | null {
  return state
}

/** The image currently shown in the result window (for "Open in scanner"). */
export function resultImage(): { bytes: Uint8Array; mime: string } | null {
  return imageBytes ? { bytes: new Uint8Array(imageBytes), mime: imageMime } : null
}

function publish(next: ResultState): void {
  state = next
  if (win && !win.isDestroyed()) win.webContents.send(IPC.resultUpdate, next)
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return win
  }
  const t = createTranslator(uiLocale())
  win = createAppWindow('result', {
    width: 1024,
    height: 700,
    minWidth: 680,
    minHeight: 480,
    show: false,
    title: t('resultTitle'),
    autoHideMenuBar: true
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  return win
}

/** Show an image in the result window and recognize it. */
export async function showResult(image: DecodedImage, languages: OcrLanguage[] = getSettings().ocrLanguages): Promise<void> {
  imageBytes = image.bytes
  imageMime = image.mime
  ensureWindow()
  await run(image.dataUrl, languages)
}

export async function rerunResult(languages: OcrLanguage[]): Promise<void> {
  if (!state || !imageBytes) return
  await run(state.image, languages)
}

async function run(dataUrl: string, languages: OcrLanguage[]): Promise<void> {
  const id = ++runId
  const bytes = imageBytes!
  publish({ image: dataUrl, status: 'loading', languages })
  try {
    const result = await recognize(bytes, languages)
    if (id !== runId) return
    publish({ image: dataUrl, status: 'done', languages, result })
    if (getSettings().autoCopy && result.text) clipboard.writeText(result.text)
  } catch (error) {
    if (id !== runId) return
    console.error('[ocr] recognition failed', error)
    publish({ image: dataUrl, status: 'error', languages, error: String(error) })
  }
}
