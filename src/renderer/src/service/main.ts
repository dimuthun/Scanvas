import { loadPdf, pageScale, renderPdfPage, type PdfDocument } from '../common/pdf'

/**
 * Hidden "service" page: Chromium does work the main process cannot do on
 * its own — decoding every image format (with EXIF orientation applied)
 * and rasterizing PDFs with pdf.js.
 */

interface Normalized {
  bytes: Uint8Array
  ext: 'jpg' | 'png'
  width: number
  height: number
}

const LOSSLESS_SOURCES = new Set(['image/png', 'image/bmp', 'image/gif'])
const documents = new Map<string, PdfDocument>()

async function encode(canvas: HTMLCanvasElement | OffscreenCanvas, png: boolean): Promise<Uint8Array> {
  const type = png ? 'image/png' : 'image/jpeg'
  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type, quality: 0.93 })
      : await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, 0.93))
  return new Uint8Array(await blob.arrayBuffer())
}

async function normalizeImage({ bytes, mime, maxSide }: { bytes: Uint8Array; mime: string; maxSide: number }): Promise<Normalized> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }), { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')!
  // Transparent areas (screenshots, logos) become white paper, not black.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  // Keep screenshots/scans lossless when reasonably small; photos become high-quality JPEG.
  const png = LOSSLESS_SOURCES.has(mime) && width * height <= 4_000_000
  return { bytes: await encode(canvas, png), ext: png ? 'png' : 'jpg', width, height }
}

async function pdfOpen({ bytes }: { bytes: Uint8Array }): Promise<{ token: string; pageCount: number }> {
  const doc = await loadPdf(bytes)
  const token = crypto.randomUUID()
  documents.set(token, doc)
  return { token, pageCount: doc.numPages }
}

async function pdfRender({ token, index, dpi, maxSide }: { token: string; index: number; dpi: number; maxSide: number }): Promise<Normalized> {
  const doc = documents.get(token)
  if (!doc) throw new Error('PDF is not open')
  const canvas = await renderPdfPage(doc, index, await pageScale(doc, index, dpi, maxSide))
  const result = { bytes: await encode(canvas, false), ext: 'jpg' as const, width: canvas.width, height: canvas.height }
  canvas.width = canvas.height = 0
  return result
}

async function pdfClose({ token }: { token: string }): Promise<void> {
  await documents.get(token)?.loadingTask.destroy()
  documents.delete(token)
}

const operations: Record<string, (args: never) => Promise<unknown>> = { normalizeImage, pdfOpen, pdfRender, pdfClose }

window.api.onServiceRequest(({ id, op, args }) => {
  const operation = operations[op]
  if (!operation) {
    void window.api.respondService(id, false, `Unknown operation ${op}`)
    return
  }
  operation(args as never).then(
    (result) => window.api.respondService(id, true, result),
    (error: unknown) => window.api.respondService(id, false, error instanceof Error ? error.message : String(error))
  )
})
