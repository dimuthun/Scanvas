import { createWorker, OEM, type Worker } from 'tesseract.js'
import { paragraphsFromBlocks, paragraphsToText } from '@shared/ocrText'
import type { OcrLanguage, OcrResult, Rotation } from '@shared/types'
import { resourcePath } from './windows'

let worker: Worker | null = null
let workerLanguages = ''
let osdWorker: Promise<Worker> | null = null
let queue: Promise<unknown> = Promise.resolve()

// Bundled models only: never download from a CDN, never write a cache.
const offline = (): { langPath: string; cacheMethod: string; gzip: boolean } => ({
  langPath: resourcePath('tessdata'),
  cacheMethod: 'none',
  gzip: true
})

async function ensureWorker(languages: OcrLanguage[]): Promise<Worker> {
  const key = languages.join('+')
  if (worker && workerLanguages === key) return worker
  if (worker) {
    await worker.reinitialize(key, OEM.LSTM_ONLY)
  } else {
    worker = await createWorker(key, OEM.LSTM_ONLY, offline())
  }
  workerLanguages = key
  return worker
}

/** Serialize jobs on the single LSTM worker. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job)
  queue = result.catch(() => undefined)
  return result
}

/** Recognize text in an encoded image (PNG/JPEG/BMP/WebP…). */
export function recognize(image: Buffer, languages: OcrLanguage[]): Promise<OcrResult> {
  return enqueue(async () => {
    const started = performance.now()
    const w = await ensureWorker(languages)
    const { data } = await w.recognize(image, {}, { text: true, blocks: true })
    const paragraphs = paragraphsFromBlocks(data.blocks)
    return {
      text: paragraphsToText(paragraphs),
      paragraphs,
      confidence: Math.round(data.confidence),
      languages,
      durationMs: Math.round(performance.now() - started)
    }
  })
}

export interface PageOcr {
  text: string
  /** Text-only PDF page (invisible text) aligned with the image, for searchable PDF export. */
  textPdf: Uint8Array
}

export function recognizePage(image: Buffer, languages: OcrLanguage[]): Promise<PageOcr> {
  return enqueue(async () => {
    const w = await ensureWorker(languages)
    const { data } = await w.recognize(image, { pdfTextOnly: true, pdfTitle: 'Scanvas OCR' }, { blocks: true, pdf: true })
    if (!data.pdf) throw new Error('Tesseract returned no PDF output')
    return { text: paragraphsToText(paragraphsFromBlocks(data.blocks)), textPdf: Uint8Array.from(data.pdf) }
  })
}

/**
 * Clockwise rotation that makes the page upright, via Tesseract's legacy OSD model.
 * Returns 0 when the detector is unsure (little text, unusual scripts…).
 */
export async function detectRotation(image: Buffer): Promise<Rotation> {
  osdWorker ??= createWorker('osd', OEM.TESSERACT_ONLY, { ...offline(), legacyCore: true, legacyLang: true })
  try {
    const w = await osdWorker
    const { data } = await w.detect(image)
    const degrees = data.orientation_degrees ?? 0
    if ((data.orientation_confidence ?? 0) < 2 || ![0, 90, 180, 270].includes(degrees)) return 0
    return degrees as Rotation
  } catch (error) {
    console.warn('[ocr] orientation detection failed', error)
    return 0
  }
}

export async function shutdownOcr(): Promise<void> {
  const w = worker
  const osd = osdWorker
  worker = null
  osdWorker = null
  await Promise.allSettled([w?.terminate(), osd?.then((o) => o.terminate())])
}
