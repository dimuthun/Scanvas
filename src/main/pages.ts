import { randomUUID } from 'node:crypto'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { defaultParams } from '@shared/pageMath'
import type { ImageExt, PageParams, PageRecord, Rotation } from '@shared/types'
import { imaging } from './imaging/client'
import { decodeImage, encodeImage, encodeThumbnail } from './imaging/codec'
import type { RawImage } from './imaging/ops'
import { ensurePageDir, library, notifyLibraryChanged, pageFile, removePageFiles } from './library'
import { detectRotation, recognizePage } from './ocr'
import { serviceCall, type NormalizedImage } from './serviceWindow'
import { getSettings } from './settings'

/** Longest side kept for imported pages (≈ A4 at 340 dpi); bigger inputs are downscaled. */
export const MAX_PAGE_SIDE = 4000

// ---------------------------------------------------------------- per-page serialization

const locks = new Map<string, Promise<unknown>>()

/** Run edits of one page strictly in order (rapid slider changes, OCR, etc.). */
function withPageLock<T>(pageId: string, job: () => Promise<T>): Promise<T> {
  const previous = locks.get(pageId) ?? Promise.resolve()
  const next = previous.then(job, job)
  const settled = next.catch(() => undefined)
  locks.set(pageId, settled)
  void settled.then(() => {
    if (locks.get(pageId) === settled) locks.delete(pageId)
  })
  return next
}

function requirePage(pageId: string): PageRecord {
  const page = library().getPage(pageId)
  if (!page) throw new Error('Page not found')
  return page
}

const loadOriginal = (page: PageRecord): RawImage => decodeImage(pageFile(page, 'original'))

const identity = (params: PageParams): PageParams => ({
  ...params,
  rotation: 0,
  flipH: false,
  flipV: false,
  crop: null,
  angle: 0,
  filter: 'original',
  removeShadows: false,
  brightness: 0,
  contrast: 0
})

async function rotationOf(image: RawImage): Promise<Rotation> {
  const small = await imaging.resize(image, 1600)
  return detectRotation(encodeImage(small, 'png'))
}

// ---------------------------------------------------------------- rendering & OCR

/** Re-render a page's processed image and thumbnail from its original and params. */
export function renderPage(pageId: string, params?: PageParams): Promise<PageRecord> {
  return withPageLock(pageId, async () => {
    const page = requirePage(pageId)
    const recipe = params ?? page.params
    const out = await imaging.process(loadOriginal(page), recipe)
    const ext: ImageExt = recipe.filter === 'bw' ? 'png' : 'jpg'
    if (ext !== page.processedExt) await rm(pageFile(page, 'processed'), { force: true })
    await writeFile(pageFile({ ...page, processedExt: ext }, 'processed'), encodeImage(out, ext))
    await writeFile(pageFile(page, 'thumb'), encodeThumbnail(out))
    const autoOcr = getSettings().autoOcrPages
    const updated = library().updatePage(pageId, {
      params: recipe,
      outWidth: out.width,
      outHeight: out.height,
      processedExt: ext,
      bumpVersion: true,
      ocrStatus: autoOcr ? 'pending' : 'none'
    })
    notifyLibraryChanged(page.docId)
    if (autoOcr) void ocrPage(pageId).catch(() => undefined)
    return updated
  })
}

/** Recognize a page's processed image; stores text (for search) and the text-layer PDF. */
export async function ocrPage(pageId: string): Promise<PageRecord> {
  const page = requirePage(pageId)
  const version = page.version
  library().updatePage(pageId, { ocrStatus: 'pending' })
  notifyLibraryChanged(page.docId)
  try {
    const result = await recognizePage(await readFile(pageFile(page, 'processed')), getSettings().ocrLanguages)
    const current = library().getPage(pageId)
    // Discard results for an image that changed (or a page deleted) while OCR ran.
    if (!current || current.version !== version) return current ?? page
    await writeFile(pageFile(current, 'text'), result.textPdf)
    const updated = library().updatePage(pageId, { ocrStatus: 'done', ocrText: result.text })
    notifyLibraryChanged(page.docId)
    return updated
  } catch (error) {
    console.error('[ocr] page OCR failed', error)
    if (library().getPage(pageId)?.version === version) library().updatePage(pageId, { ocrStatus: 'error' })
    notifyLibraryChanged(page.docId)
    throw error
  }
}

/** Make sure every page has up-to-date OCR (used before searchable PDF / Word export). */
export async function ensureOcr(docId: string, onProgress?: (done: number, total: number) => void): Promise<PageRecord[]> {
  const pages = library().listPages(docId)
  let done = 0
  for (const page of pages) {
    if (page.ocrStatus !== 'done') await ocrPage(page.id)
    onProgress?.(++done, pages.length)
  }
  return library().listPages(docId)
}

// ---------------------------------------------------------------- automatic enhancement

/** Detect edges, orientation and skew of a page and return the improved recipe. */
async function enhancedParams(page: PageRecord): Promise<PageParams> {
  const original = loadOriginal(page)
  const corners = await imaging.detect(original)
  const base = { ...identity(page.params), corners }
  const warped = await imaging.process(original, base)
  const rotation = await rotationOf(warped)
  const upright = rotation ? await imaging.process(original, { ...base, rotation }) : warped
  const angle = await imaging.skew(upright)
  return { ...page.params, corners, rotation, angle, crop: null }
}

// ---------------------------------------------------------------- importing

async function addNormalizedPage(docId: string, image: NormalizedImage, enhance: boolean, filter = getSettings().defaultFilter): Promise<PageRecord> {
  const id = randomUUID()
  await ensurePageDir(docId, id)
  const params = defaultParams(filter)
  const draft: PageRecord = {
    id,
    docId,
    index: 0,
    width: image.width,
    height: image.height,
    outWidth: image.width,
    outHeight: image.height,
    params,
    originalExt: image.ext,
    processedExt: 'jpg',
    version: 0,
    ocrStatus: 'none',
    ocrText: null
  }
  await writeFile(pageFile(draft, 'original'), image.bytes)
  const page = library().addPage(docId, { ...draft })
  let recipe = params
  if (enhance) {
    try {
      recipe = await enhancedParams(page)
    } catch (error) {
      console.warn('[pages] auto-enhance failed; keeping the full image', error)
    }
  }
  return renderPage(page.id, recipe)
}

export interface ImportOptions {
  enhance?: boolean
  filter?: PageParams['filter']
  onProgress?: (done: number, total: number) => void
}

export const IMPORTABLE_IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  webp: 'image/webp',
  gif: 'image/gif'
}

export function mimeForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  return IMPORTABLE_IMAGE_TYPES[ext] ?? null
}

/** Import image and PDF files (in the given order) as pages appended to a document. */
export async function importFiles(docId: string, paths: string[], options: ImportOptions = {}): Promise<PageRecord[]> {
  const enhance = options.enhance ?? getSettings().autoEnhance
  const added: PageRecord[] = []
  let done = 0
  let total = paths.length
  options.onProgress?.(0, total)
  for (const path of paths) {
    const mime = mimeForPath(path)
    if (!mime) continue
    const bytes = new Uint8Array(await readFile(path))
    if (mime === 'application/pdf') {
      const { token, pageCount } = await serviceCall('pdfOpen', { bytes })
      total += pageCount - 1
      try {
        for (let index = 0; index < pageCount; index++) {
          const image = await serviceCall('pdfRender', { token, index, dpi: 200, maxSide: MAX_PAGE_SIDE })
          // PDF pages are already flat; edge detection could mistake a table border for the page,
          // so they are only enhanced when explicitly requested (e.g. by the watch folder).
          added.push(await addNormalizedPage(docId, image, options.enhance ?? false, options.filter ?? 'original'))
          options.onProgress?.(++done, total)
        }
      } finally {
        await serviceCall('pdfClose', { token })
      }
    } else {
      const image = await serviceCall('normalizeImage', { bytes, mime, maxSide: MAX_PAGE_SIDE })
      added.push(await addNormalizedPage(docId, image, enhance, options.filter))
      options.onProgress?.(++done, total)
    }
  }
  return added
}

/** Import an in-memory image (OCR result window, scanner) as a new page. */
export async function importImageBytes(docId: string, bytes: Uint8Array, mime: string, options: ImportOptions = {}): Promise<PageRecord> {
  const image = await serviceCall('normalizeImage', { bytes, mime, maxSide: MAX_PAGE_SIDE })
  return addNormalizedPage(docId, image, options.enhance ?? getSettings().autoEnhance, options.filter)
}

// ---------------------------------------------------------------- page commands

export function updateParams(pageId: string, patch: Partial<PageParams>): Promise<PageRecord> {
  const page = requirePage(pageId)
  return renderPage(pageId, { ...page.params, ...patch })
}

export async function autoDetectCorners(pageId: string): Promise<PageRecord> {
  const page = requirePage(pageId)
  const corners = await imaging.detect(loadOriginal(page))
  return renderPage(pageId, { ...page.params, corners })
}

export async function straighten(pageId: string): Promise<PageRecord> {
  const page = requirePage(pageId)
  const upright = await imaging.process(loadOriginal(page), { ...identity(page.params), corners: page.params.corners, rotation: page.params.rotation, flipH: page.params.flipH, flipV: page.params.flipV, crop: page.params.crop })
  const angle = await imaging.skew(upright)
  return renderPage(pageId, { ...page.params, angle })
}

export async function autoRotate(pageId: string): Promise<PageRecord> {
  const page = requirePage(pageId)
  const original = loadOriginal(page)
  const base = { ...identity(page.params), corners: page.params.corners }
  const rotation = await rotationOf(await imaging.process(original, base))
  const angle = await imaging.skew(await imaging.process(original, { ...base, rotation }))
  return renderPage(pageId, { ...page.params, rotation, angle, crop: null })
}

export function rotatePage(pageId: string, delta: 90 | -90): Promise<PageRecord> {
  const page = requirePage(pageId)
  const rotation = (((page.params.rotation + delta) % 360) + 360) % 360
  // A book-split crop refers to the old orientation, so it is cleared.
  return renderPage(pageId, { ...page.params, rotation: rotation as Rotation, crop: null })
}

/** Split a two-page book spread into a left and a right page, each straightened. */
export async function splitSpread(pageId: string): Promise<PageRecord[]> {
  const page = requirePage(pageId)
  const base = { ...identity(page.params), corners: page.params.corners, rotation: page.params.rotation, flipH: page.params.flipH, flipV: page.params.flipV }
  const original = loadOriginal(page)
  const spread = await imaging.process(original, base)
  const gutter = (await imaging.gutter(spread)) ?? 0.5

  const leftCrop = { x: 0, y: 0, width: gutter, height: 1 }
  const rightCrop = { x: gutter, y: 0, width: 1 - gutter, height: 1 }
  const [leftAngle, rightAngle] = await Promise.all([
    imaging.skew(await imaging.process(original, { ...base, crop: leftCrop })),
    imaging.skew(await imaging.process(original, { ...base, crop: rightCrop }))
  ])

  const rightId = randomUUID()
  await ensurePageDir(page.docId, rightId)
  await copyFile(pageFile(page, 'original'), pageFile({ ...page, id: rightId }, 'original'))
  const right = library().addPage(
    page.docId,
    { id: rightId, width: page.width, height: page.height, outWidth: page.outWidth, outHeight: page.outHeight, params: page.params, originalExt: page.originalExt, processedExt: page.processedExt },
    page.index + 1
  )
  return Promise.all([
    renderPage(page.id, { ...page.params, crop: leftCrop, angle: leftAngle }),
    renderPage(right.id, { ...page.params, crop: rightCrop, angle: rightAngle })
  ])
}

export async function deletePage(pageId: string): Promise<void> {
  const page = library().getPage(pageId)
  if (!page) return
  await withPageLock(pageId, async () => {
    library().deletePage(pageId)
    await removePageFiles(page.docId, pageId)
  })
  notifyLibraryChanged(page.docId)
}

export function movePage(pageId: string, toIndex: number): void {
  const page = requirePage(pageId)
  library().movePage(pageId, toIndex)
  notifyLibraryChanged(page.docId)
}
