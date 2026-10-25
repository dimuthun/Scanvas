import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** CMaps, standard fonts and image decoders are bundled (see scripts/copy-tessdata.mjs), never fetched from a CDN. */
const assets = new URL('pdfjs/', location.href).href

export type PdfDocument = pdfjs.PDFDocumentProxy

export function loadPdf(bytes: Uint8Array): Promise<PdfDocument> {
  return pdfjs.getDocument({
    // pdf.js transfers (detaches) the buffer to its worker, so give it a copy.
    data: bytes.slice(),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`
  }).promise
}

/** Render one page (0-based) onto a new canvas with a white background. */
export async function renderPdfPage(doc: PdfDocument, index: number, scale: number, rotation = 0): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(index + 1)
  try {
    const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    return canvas
  } finally {
    page.cleanup()
  }
}

/** Scale that renders a page at `dpi` without exceeding `maxSide` pixels. */
export async function pageScale(doc: PdfDocument, index: number, dpi: number, maxSide: number): Promise<number> {
  const page = await doc.getPage(index + 1)
  const viewport = page.getViewport({ scale: 1 })
  return Math.min(dpi / 72, maxSide / Math.max(viewport.width, viewport.height))
}
