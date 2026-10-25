import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { layoutSheets, pageAssetUrl } from '@shared/pageMath'
import type { PaperSize, Rect, Size } from '@shared/types'
import { library } from './library'
import { createAppWindow } from './windows'

export interface PrintJob {
  sheets: { size: Size; items: { url: string; rect: Rect }[] }[]
}

const jobs = new Map<string, { job: PrintJob; win: BrowserWindow }>()

/** Render the document's pages into a hidden page sized in points and open the system print dialog. */
export function printDocument(docId: string, paper: PaperSize, marginMm: number): void {
  const document = library().getDocument(docId)
  const pages = library().listPages(docId)
  if (!document || pages.length === 0) return
  // Printers need a real paper size; "auto" prints on A4.
  const sheets = layoutSheets(document.layout, pages.map((p) => ({ width: p.outWidth, height: p.outHeight })), paper === 'auto' ? 'a4' : paper, marginMm)
  const job: PrintJob = {
    sheets: sheets.map((sheet) => ({
      size: sheet.size,
      items: sheet.items.map((item) => ({ url: pageAssetUrl(pages[item.pageIndex], 'processed'), rect: item.rect }))
    }))
  }
  const id = randomUUID()
  const win = createAppWindow('print', { chrome: 'plain', show: false, width: 800, height: 1000 }, { job: id })
  jobs.set(id, { job, win })
  win.on('closed', () => jobs.delete(id))
}

export function getPrintJob(id: string): PrintJob | null {
  return jobs.get(id)?.job ?? null
}

/** The print page reports that all images have loaded. */
export function printReady(id: string): void {
  const entry = jobs.get(id)
  if (!entry) return
  entry.win.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' } }, (success, reason) => {
    if (!success && reason !== 'Print job canceled' && reason !== 'cancelled') console.warn('[print] failed:', reason)
    if (!entry.win.isDestroyed()) entry.win.close()
  })
}
