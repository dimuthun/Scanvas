import { beforeAll, describe, expect, it } from 'vitest'
import { defaultParams } from '@shared/pageMath'
import { loadOpenCv } from '../src/main/imaging/loadCv'
import { detectDocument, detectGutter, measureSkew, processPage, type Cv, type RawImage } from '../src/main/imaging/ops'

let cv: Cv

beforeAll(async () => {
  cv = await loadOpenCv()
}, 60_000)

/** Draw onto a BGRA canvas with OpenCV and return it as a RawImage. */
function draw(width: number, height: number, background: number, paint: (mat: Cv) => void): RawImage {
  const mat = new cv.Mat(height, width, cv.CV_8UC4, new cv.Scalar(background, background, background, 255))
  try {
    paint(mat)
    return { width, height, data: new Uint8Array(mat.data) }
  } finally {
    mat.delete()
  }
}

const black = (): Cv => new cv.Scalar(20, 20, 20, 255)

/** Lines of "words" (short dark bars) like a printed page. */
function textLines(mat: Cv, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y < y1; y += 28) {
    for (let x = x0; x < x1 - 40; x += 70) {
      cv.rectangle(mat, new cv.Point(x, y), new cv.Point(x + 52, y + 9), black(), -1)
    }
  }
}

function rotate(image: RawImage, angle: number): RawImage {
  const src = new cv.Mat(image.height, image.width, cv.CV_8UC4)
  src.data.set(image.data)
  const dst = new cv.Mat()
  const m = cv.getRotationMatrix2D(new cv.Point(image.width / 2, image.height / 2), angle, 1)
  cv.warpAffine(src, dst, m, new cv.Size(image.width, image.height), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
  const out = { width: image.width, height: image.height, data: new Uint8Array(dst.data) }
  src.delete()
  dst.delete()
  m.delete()
  return out
}

describe('detectDocument', () => {
  it('finds a light page on a dark desk', () => {
    const corners = [
      [150, 100],
      [650, 140],
      [620, 520],
      [120, 480]
    ]
    const image = draw(800, 600, 45, (mat) => {
      const points = cv.matFromArray(4, 1, cv.CV_32SC2, corners.flat())
      const polys = new cv.MatVector()
      polys.push_back(points)
      cv.fillPoly(mat, polys, new cv.Scalar(235, 235, 235, 255))
      textLines(mat, 200, 560, 180, 440)
      points.delete()
      polys.delete()
    })
    const quad = detectDocument(cv, image)
    expect(quad).not.toBeNull()
    quad!.forEach((p, i) => {
      expect(p.x * 800).toBeCloseTo(corners[i][0], -1.3)
      expect(p.y * 600).toBeCloseTo(corners[i][1], -1.3)
    })
  })

  it('returns null for a plain screenshot-like image', () => {
    expect(detectDocument(cv, draw(400, 300, 255, (mat) => textLines(mat, 20, 380, 20, 280)))).toBeNull()
  })
})

describe('measureSkew', () => {
  const page = (): RawImage => draw(1000, 800, 255, (mat) => textLines(mat, 120, 880, 120, 680))

  it.each([5, -3, 8.5])('undoes a %s° tilt', (tilt) => {
    const measured = measureSkew(cv, rotate(page(), tilt))
    expect(Math.abs(measured + tilt)).toBeLessThan(0.35)
  })

  it('leaves straight pages alone', () => {
    expect(measureSkew(cv, page())).toBe(0)
  })

  it('returns 0 for blank pages', () => {
    expect(measureSkew(cv, draw(500, 500, 255, () => undefined))).toBe(0)
  })
})

describe('processPage', () => {
  const source = (): RawImage => draw(400, 300, 200, (mat) => textLines(mat, 30, 370, 30, 270))

  it('rotates by 90° and swaps dimensions', () => {
    const out = processPage(cv, source(), { ...defaultParams('original'), rotation: 90 })
    expect([out.width, out.height]).toEqual([300, 400])
    expect(out.data.length).toBe(300 * 400 * 4)
  })

  it('warps a quad to its output size', () => {
    const params = {
      ...defaultParams('original'),
      corners: [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 }
      ] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
    }
    const out = processPage(cv, source(), params)
    expect([out.width, out.height]).toEqual([200, 150])
  })

  it('crops the left half for book splitting', () => {
    const out = processPage(cv, source(), { ...defaultParams('original'), crop: { x: 0, y: 0, width: 0.5, height: 1 } })
    expect([out.width, out.height]).toEqual([200, 300])
  })

  it('B&W produces pure black and white pixels', () => {
    const out = processPage(cv, source(), defaultParams('bw'))
    const values = new Set<number>()
    for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i])
    expect([...values].every((v) => v === 0 || v === 255)).toBe(true)
    expect(values.size).toBe(2)
  })

  it.each(['magic', 'gray'] as const)('%s filter keeps the size', (filter) => {
    const out = processPage(cv, source(), { ...defaultParams(filter), brightness: 10, contrast: 10 })
    expect([out.width, out.height]).toEqual([400, 300])
  })
})

describe('detectGutter', () => {
  it('finds the white gap between two pages', () => {
    const image = draw(1200, 800, 250, (mat) => {
      textLines(mat, 60, 560, 80, 720)
      textLines(mat, 700, 1150, 80, 720)
    })
    const gutter = detectGutter(cv, image)
    expect(gutter).not.toBeNull()
    expect(gutter! * 1200).toBeGreaterThan(560)
    expect(gutter! * 1200).toBeLessThan(700)
  })
})
