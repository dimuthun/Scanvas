import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import { degrees, PDFDocument } from 'pdf-lib'
import { parseRanges, splitEvery } from '@shared/pageMath'
import type { PdfToolFile, PdfToolPage, SplitMode } from '@shared/types'
import { requestExport } from './exports'

/** PDFs opened in the PDF tools window, by id. */
const files = new Map<string, { name: string; bytes: Uint8Array; doc: PDFDocument }>()

export async function openPdfFiles(owner?: BrowserWindow): Promise<PdfToolFile[]> {
  const options: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF', extensions: ['pdf'] }] }
  const { canceled, filePaths } = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
  if (canceled) return []
  const opened: PdfToolFile[] = []
  for (const path of filePaths) {
    const bytes = new Uint8Array(await readFile(path))
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const fileId = randomUUID()
    const name = basename(path, extname(path))
    files.set(fileId, { name, bytes, doc })
    opened.push({ fileId, name, pageCount: doc.getPageCount(), bytes })
  }
  return opened
}

export function closePdfFile(fileId: string): void {
  files.delete(fileId)
}

/** New PDF made of the given pages (from any opened files), in order, with extra rotation applied. */
async function compose(pages: PdfToolPage[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  out.setCreator('Scanvas')
  for (const page of pages) {
    const source = files.get(page.fileId)
    if (!source) throw new Error('A source PDF is no longer open')
    const [copied] = await out.copyPages(source.doc, [page.pageIndex])
    if (page.rotation) copied.setRotation(degrees((copied.getRotation().angle + page.rotation) % 360))
    out.addPage(copied)
  }
  return out.save()
}

export async function saveComposed(pages: PdfToolPage[], name: string): Promise<string | null> {
  if (pages.length === 0) throw new Error('No pages to save')
  return requestExport(name, 'pdf', async (filePath, progress) => {
    const bytes = await compose(pages)
    progress(0.9)
    await writeFile(filePath, bytes)
  })
}

/** Split the arranged pages into several PDFs: "<name>-1.pdf", "<name>-2.pdf", … */
export async function saveSplit(pages: PdfToolPage[], mode: SplitMode, name: string): Promise<string | null> {
  const groups = mode.kind === 'every' ? splitEvery(mode.size, pages.length) : parseRanges(mode.ranges, pages.length)
  return requestExport(`${name}-1`, 'pdf', async (firstPath, progress) => {
    const base = firstPath.replace(/-1( \(\d+\))?\.pdf$/i, '')
    const suffix = /( \(\d+\))\.pdf$/i.exec(firstPath)?.[1] ?? ''
    for (const [i, group] of groups.entries()) {
      const target = `${base}-${i + 1}${suffix}.pdf`
      await writeFile(target, await compose(group.map((index) => pages[index])))
      progress((i + 1) / groups.length)
    }
  })
}
