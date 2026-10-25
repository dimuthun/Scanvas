import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { Document, ImageRun, Packer, PageBreak, Paragraph, TextRun } from 'docx'
import { PDFDocument } from 'pdf-lib'
import { layoutSheets } from '@shared/pageMath'
import type { ImageExt, PageRecord, PdfExportOptions, PdfQuality } from '@shared/types'
import { shrinkEncoded } from './imaging/codec'
import { library, pageFile } from './library'
import { ensureOcr } from './pages'

export type Progress = (fraction: number) => void

async function pageImage(page: PageRecord, quality: PdfQuality): Promise<{ bytes: Buffer; ext: ImageExt }> {
  const bytes = await readFile(pageFile(page, 'processed'))
  if (quality === 'high') return { bytes, ext: page.processedExt }
  if (quality === 'medium') return { bytes: shrinkEncoded(bytes, 2200, page.processedExt, 85), ext: page.processedExt }
  return { bytes: shrinkEncoded(bytes, 1400, 'jpg', 70), ext: 'jpg' }
}

function requireDocument(docId: string): { title: string; layout: 'pages' | 'idcard'; pages: PageRecord[] } {
  const document = library().getDocument(docId)
  if (!document) throw new Error('Document not found')
  const pages = library().listPages(docId)
  if (pages.length === 0) throw new Error('The document has no pages')
  return { title: document.title, layout: document.layout, pages }
}

/** Build a (optionally searchable) PDF: one processed image per sheet, or ID-card sheets. */
export async function buildPdf(docId: string, options: PdfExportOptions, progress: Progress = () => undefined): Promise<Uint8Array> {
  const { title, layout } = requireDocument(docId)
  let pages = library().listPages(docId)
  const ocrShare = options.textLayer ? 0.6 : 0
  if (options.textLayer) pages = await ensureOcr(docId, (done, total) => progress((ocrShare * done) / total))

  const sheets = layoutSheets(layout, pages.map((p) => ({ width: p.outWidth, height: p.outHeight })), options.paper, options.marginMm)
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setCreator('Scanvas')
  pdf.setProducer('Scanvas')

  let done = 0
  const totalItems = sheets.reduce((n, s) => n + s.items.length, 0)
  for (const sheet of sheets) {
    const pdfPage = pdf.addPage([sheet.size.width, sheet.size.height])
    for (const item of sheet.items) {
      const page = pages[item.pageIndex]
      const { bytes, ext } = await pageImage(page, options.quality)
      const image = ext === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      // pdf-lib uses a bottom-left origin; layouts are top-left based.
      const box = { x: item.rect.x, y: sheet.size.height - item.rect.y - item.rect.height, width: item.rect.width, height: item.rect.height }
      pdfPage.drawImage(image, box)
      const textPdf = pageFile(page, 'text')
      if (options.textLayer && existsSync(textPdf)) {
        try {
          const [textLayer] = await pdf.embedPdf(await readFile(textPdf))
          pdfPage.drawPage(textLayer, box)
        } catch (error) {
          console.warn('[export] could not embed the OCR text layer', error)
        }
      }
      progress(ocrShare + ((1 - ocrShare) * ++done) / totalItems)
    }
  }
  return pdf.save()
}

export async function exportPdf(docId: string, filePath: string, options: PdfExportOptions, progress: Progress): Promise<void> {
  await writeFile(filePath, await buildPdf(docId, options, progress))
}

/** Word document: each page's image followed by its recognized paragraphs. */
export async function exportDocx(docId: string, filePath: string, progress: Progress, includeImages = true): Promise<void> {
  const { title } = requireDocument(docId)
  const pages = await ensureOcr(docId, (done, total) => progress((0.7 * done) / total))
  const children: Paragraph[] = []
  for (const [i, page] of pages.entries()) {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    if (includeImages) {
      const { bytes, ext } = await pageImage(page, 'medium')
      const width = 600 // px at 96 dpi ≈ 6.25 in, fits Letter/A4 margins
      children.push(
        new Paragraph({
          children: [
            new ImageRun({ type: ext, data: bytes, transformation: { width, height: Math.round((width * page.outHeight) / page.outWidth) } })
          ]
        })
      )
    }
    for (const paragraph of (page.ocrText ?? '').split(/\n{2,}/).filter((p) => p.trim())) {
      const lines = paragraph.split('\n')
      children.push(new Paragraph({ children: lines.map((line, k) => new TextRun({ text: line, break: k > 0 ? 1 : 0 })) }))
    }
    progress(0.7 + (0.3 * (i + 1)) / pages.length)
  }
  const doc = new Document({ creator: 'Scanvas', title, sections: [{ children }] })
  await writeFile(filePath, await Packer.toBuffer(doc))
}

/** Processed page images: "<name>.jpg" for one page, "<name>-01.jpg", "<name>-02.png"… otherwise. */
export async function exportImages(docId: string, filePath: string, progress: Progress): Promise<string[]> {
  const { pages } = requireDocument(docId)
  const base = filePath.replace(/\.[^.\\/]+$/, '')
  const written: string[] = []
  for (const [i, page] of pages.entries()) {
    const target = pages.length === 1 ? `${base}.${page.processedExt}` : `${base}-${String(i + 1).padStart(2, '0')}.${page.processedExt}`
    await writeFile(target, await readFile(pageFile(page, 'processed')))
    written.push(target)
    progress((i + 1) / pages.length)
  }
  return written
}

export async function exportText(docId: string, filePath: string, progress: Progress): Promise<void> {
  requireDocument(docId)
  const pages = await ensureOcr(docId, (done, total) => progress(done / total))
  const text = pages.map((p) => (p.ocrText ?? '').trim()).join('\n\n----------\n\n')
  await writeFile(filePath, text, 'utf8')
}
