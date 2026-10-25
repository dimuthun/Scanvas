import type { DocLayout, FilterName, PageParams, PaperSize, Point, Quad, Rect, Size } from './types'

export const PT_PER_MM = 72 / 25.4
/** ISO/IEC 7810 ID-1 card (credit cards, most ID cards). */
export const ID_CARD_MM = { width: 85.6, height: 53.98 }

const PAPER_PT: Record<Exclude<PaperSize, 'auto'>, Size> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 }
}

export function defaultParams(filter: FilterName = 'magic'): PageParams {
  return {
    corners: null,
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: null,
    angle: 0,
    filter,
    removeShadows: false,
    brightness: 0,
    contrast: 0
  }
}

/** Order four arbitrary points as top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(points: Point[]): Quad {
  if (points.length !== 4) throw new Error('A quad needs exactly 4 points')
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y))
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]]
}

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Output size of a perspective-corrected quad given in pixels. */
export function quadOutputSize(quad: Quad): Size {
  const [tl, tr, br, bl] = quad
  return {
    width: Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br)))),
    height: Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br))))
  }
}

/** Shoelace area of a quad (same units squared as its coordinates). */
export function quadArea(quad: Quad): number {
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function isConvexQuad(quad: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const c = quad[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (cross === 0) continue
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return true
}

export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 }
]

/** Size of the processed page before cropping/straightening, in original pixels. */
export function processedSize(original: Size, params: Pick<PageParams, 'corners' | 'rotation' | 'crop'>): Size {
  const quad = (params.corners ?? FULL_QUAD).map((p) => ({ x: p.x * original.width, y: p.y * original.height })) as Quad
  let size = quadOutputSize(quad)
  if (params.rotation === 90 || params.rotation === 270) size = { width: size.height, height: size.width }
  if (params.crop) {
    size = {
      width: Math.max(1, Math.round(size.width * params.crop.width)),
      height: Math.max(1, Math.round(size.height * params.crop.height))
    }
  }
  return size
}

/** Paper size in PDF points; orientation follows the image (landscape for wide images). */
export function paperSizePt(paper: PaperSize, image: Size): Size {
  const landscape = image.width > image.height
  if (paper === 'auto') {
    const width = landscape ? PAPER_PT.a4.height : PAPER_PT.a4.width
    return { width, height: (width * image.height) / image.width }
  }
  const base = PAPER_PT[paper]
  return landscape ? { width: base.height, height: base.width } : base
}

/** Largest rectangle with the image's aspect ratio centered inside the page minus margins. */
export function fitRect(image: Size, page: Size, margin: number): Rect {
  const boxW = Math.max(1, page.width - 2 * margin)
  const boxH = Math.max(1, page.height - 2 * margin)
  const scale = Math.min(boxW / image.width, boxH / image.height)
  const width = image.width * scale
  const height = image.height * scale
  return { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height }
}

/**
 * ID-card sheet: up to two cards (front/back) at true ID-1 size, centered
 * horizontally at one third and two thirds of the page height.
 * Rects are top-left based, in points.
 */
export function idCardSlots(page: Size, cards: Size[]): Rect[] {
  return cards.slice(0, 2).map((card, i) => {
    const portrait = card.height > card.width
    const width = (portrait ? ID_CARD_MM.height : ID_CARD_MM.width) * PT_PER_MM
    const height = (portrait ? ID_CARD_MM.width : ID_CARD_MM.height) * PT_PER_MM
    const centerY = (page.height * (i + 1)) / 3
    return { x: (page.width - width) / 2, y: centerY - height / 2, width, height }
  })
}

export interface SheetItem {
  pageIndex: number
  rect: Rect
}

export interface Sheet {
  size: Size
  items: SheetItem[]
}

/** Lay out processed page images onto printable sheets (points, top-left origin). */
export function layoutSheets(layout: DocLayout, images: Size[], paper: PaperSize, marginMm: number): Sheet[] {
  if (layout === 'idcard') {
    const sheets: Sheet[] = []
    for (let i = 0; i < images.length; i += 2) {
      const size = paperSizePt(paper === 'auto' ? 'a4' : paper, { width: 1, height: 2 })
      const cards = images.slice(i, i + 2)
      sheets.push({ size, items: idCardSlots(size, cards).map((rect, k) => ({ pageIndex: i + k, rect })) })
    }
    return sheets
  }
  const margin = marginMm * PT_PER_MM
  return images.map((image, pageIndex) => {
    const size = paperSizePt(paper, image)
    return { size, items: [{ pageIndex, rect: fitRect(image, size, paper === 'auto' ? 0 : margin) }] }
  })
}

/**
 * Pick the gutter of a two-page book spread from a per-column "ink" profile:
 * the least-inked column near the middle (the white gap between pages).
 * Returns a 0–1 position, or null when the profile is too short.
 */
export function findGutter(profile: ArrayLike<number>, searchFrom = 0.35, searchTo = 0.65): number | null {
  const n = profile.length
  if (n < 20) return null
  const radius = Math.max(1, Math.round(n * 0.01))
  let best = -1
  let bestValue = Infinity
  const from = Math.floor(n * searchFrom)
  const to = Math.ceil(n * searchTo)
  for (let i = from; i <= to && i < n; i++) {
    let sum = 0
    let count = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) {
      sum += profile[k]
      count++
    }
    const value = sum / count
    // Prefer columns closer to the center on ties.
    if (value < bestValue - 1e-9 || (Math.abs(value - bestValue) <= 1e-9 && Math.abs(i - n / 2) < Math.abs(best - n / 2))) {
      bestValue = value
      best = i
    }
  }
  return best < 0 ? null : best / n
}

/** Parse "1-3, 5, 8-" style page ranges (1-based, inclusive) into 0-based index groups. */
export function parseRanges(input: string, pageCount: number): number[][] {
  const groups: number[][] = []
  for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d*)(?:-(\d*))?$/.exec(part)
    if (!match) throw new Error(`Invalid range "${part}"`)
    const isRange = part.includes('-')
    const start = match[1] ? Number(match[1]) : 1
    const end = isRange ? (match[2] ? Number(match[2]) : pageCount) : start
    if (start < 1 || end > pageCount || start > end) throw new Error(`Range "${part}" is outside 1–${pageCount}`)
    groups.push(Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i))
  }
  if (groups.length === 0) throw new Error('No pages selected')
  return groups
}

export function splitEvery(size: number, pageCount: number): number[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Split size must be a positive whole number')
  const groups: number[][] = []
  for (let start = 0; start < pageCount; start += size) {
    groups.push(Array.from({ length: Math.min(size, pageCount - start) }, (_, i) => start + i))
  }
  return groups
}

export type PageAsset = 'original' | 'processed' | 'thumb'

export function pageAssetUrl(page: { docId: string; id: string; version: number }, asset: PageAsset): string {
  return `scanvas://library/${page.docId}/${page.id}/${asset}?v=${page.version}`
}

/** File name without characters Windows/macOS reject; never empty. */
export function safeFileName(name: string, fallback = 'document'): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return cleaned.slice(0, 120) || fallback
}
