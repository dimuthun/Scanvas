import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/api'
import type { ImageExt } from '@shared/types'
import { createAppWindow } from './windows'

/**
 * A hidden renderer used for work that needs Chromium: decoding any image
 * format with EXIF orientation applied, and rasterizing PDFs with pdf.js.
 */
export interface ServiceOps {
  normalizeImage: { args: { bytes: Uint8Array; mime: string; maxSide: number }; result: NormalizedImage }
  pdfOpen: { args: { bytes: Uint8Array }; result: { token: string; pageCount: number } }
  pdfRender: { args: { token: string; index: number; dpi: number; maxSide: number }; result: NormalizedImage }
  pdfClose: { args: { token: string }; result: void }
}

export interface NormalizedImage {
  bytes: Uint8Array
  ext: ImageExt
  width: number
  height: number
}

let win: BrowserWindow | null = null
let ready: Promise<BrowserWindow> | null = null
let nextId = 1
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

function ensureService(): Promise<BrowserWindow> {
  if (ready && win && !win.isDestroyed()) return ready
  const w = createAppWindow('service', { chrome: 'plain', show: false, width: 400, height: 300, skipTaskbar: true })
  win = w
  ready = new Promise((resolve, reject) => {
    w.webContents.once('did-finish-load', () => resolve(w))
    w.webContents.once('did-fail-load', (_e, _code, description) => reject(new Error(description)))
  })
  w.on('closed', () => {
    win = null
    ready = null
    for (const entry of pending.values()) entry.reject(new Error('Service window closed'))
    pending.clear()
  })
  w.webContents.on('render-process-gone', () => w.destroy())
  return ready
}

export async function serviceCall<K extends keyof ServiceOps>(op: K, args: ServiceOps[K]['args']): Promise<ServiceOps[K]['result']> {
  const w = await ensureService()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Service operation ${op} timed out`))
    }, 180_000)
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value as ServiceOps[K]['result'])
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      }
    })
    w.webContents.send(IPC.serviceRequest, { id, op, args })
  })
}

/** Called from the IPC handler when the service renderer answers. */
export function resolveServiceCall(id: number, ok: boolean, payload: unknown): void {
  const entry = pending.get(id)
  if (!entry) return
  pending.delete(id)
  if (ok) entry.resolve(payload)
  else entry.reject(new Error(String(payload)))
}

export function isServiceWindow(contents: Electron.WebContents): boolean {
  return !!win && !win.isDestroyed() && win.webContents === contents
}
