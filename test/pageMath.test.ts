import { describe, expect, it } from 'vitest'
import {
  defaultParams,
  findGutter,
  fitRect,
  idCardSlots,
  isConvexQuad,
  layoutSheets,
  orderQuad,
  pageAssetUrl,
  paperSizePt,
  parseRanges,
  processedSize,
  PT_PER_MM,
  quadArea,
  quadOutputSize,
  safeFileName,
  splitEvery
} from '@shared/pageMath'
import type { Quad } from '@shared/types'

describe('quads', () => {
  it('orders corners regardless of input order', () => {
    const quad = orderQuad([
      { x: 0.9, y: 0.85 },
      { x: 0.1, y: 0.1 },
      { x: 0.12, y: 0.9 },
      { x: 0.88, y: 0.05 }
    ])
    expect(quad).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.88, y: 0.05 },
      { x: 0.9, y: 0.85 },
      { x: 0.12, y: 0.9 }
    ])
  })

  it('measures output size, area and convexity', () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 310, y: 400 },
      { x: 0, y: 400 }
    ]
    expect(quadOutputSize(quad)).toEqual({ width: 310, height: 400 })
    expect(quadArea(quad)).toBe(122000)
    expect(isConvexQuad(quad)).toBe(true)
    const bowtie: Quad = [quad[0], quad[2], quad[1], quad[3]]
    expect(isConvexQuad(bowtie)).toBe(false)
  })

  it('predicts the processed size from the recipe', () => {
    const original = { width: 4000, height: 3000 }
    expect(processedSize(original, defaultParams())).toEqual(original)
    expect(processedSize(original, { ...defaultParams(), rotation: 90 })).toEqual({ width: 3000, height: 4000 })
    expect(processedSize(original, { ...defaultParams(), crop: { x: 0, y: 0, width: 0.5, height: 1 } })).toEqual({ width: 2000, height: 3000 })
  })
})

describe('paper layout', () => {
  it('uses landscape paper for wide images', () => {
    expect(paperSizePt('a4', { width: 2000, height: 1000 })).toEqual({ width: 841.89, height: 595.28 })
    expect(paperSizePt('letter', { width: 1000, height: 2000 })).toEqual({ width: 612, height: 792 })
  })

  it('auto paper keeps the image aspect ratio', () => {
    const size = paperSizePt('auto', { width: 1000, height: 1500 })
    expect(size.width).toBeCloseTo(595.28)
    expect(size.height).toBeCloseTo(892.92)
  })

  it('fits and centers an image inside margins', () => {
    const rect = fitRect({ width: 100, height: 200 }, { width: 600, height: 800 }, 50)
    expect(rect).toEqual({ x: 125, y: 50, width: 350, height: 700 })
  })

  it('places ID cards at true size, one third and two thirds down the page', () => {
    const page = { width: 595.28, height: 841.89 }
    const [front, back] = idCardSlots(page, [
      { width: 856, height: 540 },
      { width: 856, height: 540 }
    ])
    expect(front.width / PT_PER_MM).toBeCloseTo(85.6)
    expect(front.height / PT_PER_MM).toBeCloseTo(53.98)
    expect(front.y + front.height / 2).toBeCloseTo(page.height / 3)
    expect(back.y + back.height / 2).toBeCloseTo((page.height * 2) / 3)
    expect(front.x).toBeCloseTo((page.width - front.width) / 2)
  })

  it('lays out two ID cards per sheet', () => {
    const sheets = layoutSheets('idcard', Array(3).fill({ width: 856, height: 540 }), 'a4', 10)
    expect(sheets.map((s) => s.items.map((i) => i.pageIndex))).toEqual([[0, 1], [2]])
  })

  it('lays out one page per sheet with margins', () => {
    const [sheet] = layoutSheets('pages', [{ width: 1000, height: 1414 }], 'a4', 10)
    expect(sheet.items[0].rect.y).toBeGreaterThanOrEqual(10 * PT_PER_MM - 0.01)
    expect(sheet.items[0].rect.x).toBeGreaterThanOrEqual(10 * PT_PER_MM - 0.01)
  })
})

describe('page ranges', () => {
  it('parses ranges, single pages and open ends', () => {
    expect(parseRanges('1-3, 5, 7-', 8)).toEqual([[0, 1, 2], [4], [6, 7]])
    expect(parseRanges('-2', 4)).toEqual([[0, 1]])
  })

  it('rejects out-of-range or malformed input', () => {
    expect(() => parseRanges('0-2', 5)).toThrow()
    expect(() => parseRanges('3-9', 5)).toThrow()
    expect(() => parseRanges('a', 5)).toThrow()
    expect(() => parseRanges('', 5)).toThrow()
  })

  it('splits every N pages', () => {
    expect(splitEvery(2, 5)).toEqual([[0, 1], [2, 3], [4]])
    expect(() => splitEvery(0, 5)).toThrow()
  })
})

describe('findGutter', () => {
  it('finds the least-inked column near the middle', () => {
    const profile = Array.from({ length: 100 }, (_, i) => (i >= 52 && i <= 54 ? 0 : 50))
    expect(findGutter(profile)).toBeCloseTo(0.53, 2)
  })

  it('ignores blank margins outside the search window', () => {
    const profile = Array.from({ length: 100 }, (_, i) => (i < 10 || i > 90 ? 0 : i >= 47 && i <= 49 ? 5 : 40))
    expect(findGutter(profile)).toBeCloseTo(0.48, 2)
  })
})

describe('misc', () => {
  it('builds versioned asset URLs', () => {
    expect(pageAssetUrl({ docId: 'd', id: 'p', version: 3 }, 'thumb')).toBe('scanvas://library/d/p/thumb?v=3')
  })

  it('sanitizes file names', () => {
    expect(safeFileName('Invoice: 2026/10 <final>?. ')).toBe('Invoice 2026 10 final')
    expect(safeFileName('...')).toBe('document')
  })
})
