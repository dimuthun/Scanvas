import { findGutter, isConvexQuad, orderQuad, quadArea, quadOutputSize } from '@shared/pageMath'
import type { PageParams, Point, Quad } from '@shared/types'

/**
 * OpenCV.js is an Emscripten module without reliable typings; it is used
 * through this alias and every Mat is released via `Scope`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cv = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mat = any

/** Raw 8-bit BGRA pixels (the layout of Electron's nativeImage bitmaps). */
export interface RawImage {
  width: number
  height: number
  data: Uint8Array
}

/** Collects Mats so they are deleted even when an operation throws. */
class Scope {
  private readonly mats: Mat[] = []
  constructor(private readonly cv: Cv) {}
  mat(m?: Mat): Mat {
    const value = m ?? new this.cv.Mat()
    this.mats.push(value)
    return value
  }
  dispose(): void {
    for (const m of this.mats) if (!m.isDeleted()) m.delete()
    this.mats.length = 0
  }
}

function withScope<T>(cv: Cv, fn: (s: Scope) => T): T {
  const scope = new Scope(cv)
  try {
    return fn(scope)
  } finally {
    scope.dispose()
  }
}

const odd = (n: number): number => {
  const v = Math.max(3, Math.round(n))
  return v % 2 === 0 ? v + 1 : v
}

function matFromRaw(cv: Cv, s: Scope, image: RawImage): Mat {
  const mat = s.mat(new cv.Mat(image.height, image.width, cv.CV_8UC4))
  mat.data.set(image.data)
  return mat
}

function rawFromMat(cv: Cv, s: Scope, mat: Mat): RawImage {
  let bgra = mat
  if (mat.channels() === 1) {
    bgra = s.mat()
    cv.cvtColor(mat, bgra, cv.COLOR_GRAY2BGRA)
  } else if (mat.channels() === 3) {
    bgra = s.mat()
    cv.cvtColor(mat, bgra, cv.COLOR_BGR2BGRA)
  }
  return { width: bgra.cols, height: bgra.rows, data: new Uint8Array(bgra.data) }
}

/** Downscale so the longest side is at most `maxSide`; returns the scale used. */
function downscale(cv: Cv, s: Scope, src: Mat, maxSide: number): { mat: Mat; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(src.cols, src.rows))
  if (scale === 1) return { mat: src, scale }
  const dst = s.mat()
  cv.resize(src, dst, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA)
  return { mat: dst, scale }
}

function toGray(cv: Cv, s: Scope, src: Mat): Mat {
  const gray = s.mat()
  cv.cvtColor(src, gray, src.channels() === 4 ? cv.COLOR_BGRA2GRAY : cv.COLOR_BGR2GRAY)
  return gray
}

// ---------------------------------------------------------------- detection

/**
 * Find the document outline in a photo. Returns normalized corners, or null
 * when no convincing quadrilateral covers a meaningful part of the image.
 */
export function detectDocument(cv: Cv, image: RawImage): Quad | null {
  return withScope(cv, (s) => {
    const src = matFromRaw(cv, s, image)
    const { mat: small } = downscale(cv, s, src, 800)
    const gray = toGray(cv, s, small)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)
    // Closing removes the text printed on the page so only the page outline remains.
    const kernel = s.mat(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)))
    cv.morphologyEx(gray, gray, cv.MORPH_CLOSE, kernel)
    const edges = s.mat()
    cv.Canny(gray, edges, 30, 100)
    cv.dilate(edges, edges, s.mat(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))))

    const contours = s.mat(new cv.MatVector())
    const hierarchy = s.mat()
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const width = small.cols
    const height = small.rows
    const imageArea = width * height
    const candidates: { area: number; index: number }[] = []
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      candidates.push({ area: cv.contourArea(contour), index: i })
      contour.delete()
    }
    candidates.sort((a, b) => b.area - a.area)

    for (const { area, index } of candidates.slice(0, 12)) {
      if (area < imageArea * 0.15) break
      const contour = s.mat(contours.get(index))
      const hull = s.mat()
      cv.convexHull(contour, hull, false, true)
      const approx = s.mat()
      const perimeter = cv.arcLength(hull, true)
      for (const epsilon of [0.02, 0.03, 0.05]) {
        cv.approxPolyDP(hull, approx, epsilon * perimeter, true)
        if (approx.rows === 4) break
      }
      if (approx.rows !== 4) continue
      const points: Point[] = []
      for (let k = 0; k < 4; k++) {
        points.push({ x: approx.data32S[k * 2] / width, y: approx.data32S[k * 2 + 1] / height })
      }
      const quad = orderQuad(points)
      const normalizedArea = quadArea(quad)
      if (isConvexQuad(quad) && normalizedArea >= 0.15 && normalizedArea <= 0.985) return quad
    }
    return null
  })
}

// ---------------------------------------------------------------- straighten

/** Sharpness of horizontal text lines: sum of squared differences between adjacent row sums. */
function rowProfileScore(cv: Cv, binary: Mat, angle: number): number {
  // Called ~50 times per measurement, so these Mats are freed immediately rather than scoped.
  const rotated = new cv.Mat()
  const rows = new cv.Mat()
  const m = cv.getRotationMatrix2D(new cv.Point(binary.cols / 2, binary.rows / 2), angle, 1)
  try {
    cv.warpAffine(binary, rotated, m, new cv.Size(binary.cols, binary.rows), cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0))
    cv.reduce(rotated, rows, 1, cv.REDUCE_SUM, cv.CV_32S)
    const sums: Int32Array = rows.data32S
    let score = 0
    for (let i = 1; i < sums.length; i++) {
      const d = sums[i] - sums[i - 1]
      score += d * d
    }
    return score
  } finally {
    rotated.delete()
    rows.delete()
    m.delete()
  }
}

/**
 * Straighten angle (degrees, OpenCV counter-clockwise convention) that makes
 * text lines horizontal, found by maximizing the row-profile sharpness.
 * Returns 0 when the image has no measurable text structure.
 */
export function measureSkew(cv: Cv, image: RawImage, maxAngle = 15): number {
  return withScope(cv, (s) => {
    const src = matFromRaw(cv, s, image)
    const { mat: small } = downscale(cv, s, src, 1000)
    const gray = toGray(cv, s, small)
    const binary = s.mat()
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, odd(Math.min(gray.cols, gray.rows) / 30), 15)
    if (cv.countNonZero(binary) < binary.rows * binary.cols * 0.002) return 0

    const score = (angle: number): number => rowProfileScore(cv, binary, angle)
    let best = 0
    let bestScore = score(0)
    for (let a = -maxAngle; a <= maxAngle; a += 1) {
      if (a === 0) continue
      const value = score(a)
      if (value > bestScore) {
        bestScore = value
        best = a
      }
    }
    const coarse = best
    for (let a = coarse - 0.9; a <= coarse + 0.9 + 1e-9; a += 0.1) {
      const rounded = Math.round(a * 10) / 10
      const value = score(rounded)
      if (value > bestScore) {
        bestScore = value
        best = rounded
      }
    }
    return Math.abs(best) < 0.15 ? 0 : best
  })
}

/** Gutter position (0–1) of a two-page spread, from the column ink profile. */
export function detectGutter(cv: Cv, image: RawImage): number | null {
  return withScope(cv, (s) => {
    const src = matFromRaw(cv, s, image)
    const { mat: small } = downscale(cv, s, src, 900)
    const gray = toGray(cv, s, small)
    const binary = s.mat()
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, odd(Math.min(gray.cols, gray.rows) / 30), 15)
    const top = Math.round(binary.rows * 0.1)
    const band = binary.roi(new cv.Rect(0, top, binary.cols, Math.max(1, binary.rows - 2 * top)))
    s.mat(band)
    const columns = s.mat()
    cv.reduce(band, columns, 0, cv.REDUCE_SUM, cv.CV_32S)
    return findGutter(columns.data32S as Int32Array)
  })
}

// ---------------------------------------------------------------- processing

/** Flatten uneven lighting: divide out a heavily blurred background estimate. */
function removeShadow(cv: Cv, s: Scope, channel: Mat): Mat {
  const shortSide = Math.min(channel.cols, channel.rows)
  const background = s.mat()
  cv.dilate(channel, background, s.mat(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(odd(shortSide / 150), odd(shortSide / 150)))))
  cv.medianBlur(background, background, Math.min(odd(shortSide / 40), 255))
  const diff = s.mat()
  cv.absdiff(channel, background, diff)
  const out = s.mat()
  cv.bitwise_not(diff, out)
  cv.normalize(out, out, 0, 255, cv.NORM_MINMAX)
  return out
}

function perChannel(cv: Cv, s: Scope, bgr: Mat, fn: (channel: Mat) => Mat): Mat {
  const channels = s.mat(new cv.MatVector())
  cv.split(bgr, channels)
  const outChannels = s.mat(new cv.MatVector())
  for (let i = 0; i < channels.size(); i++) {
    const ch = s.mat(channels.get(i))
    outChannels.push_back(fn(ch))
  }
  const merged = s.mat()
  cv.merge(outChannels, merged)
  return merged
}

function boostSaturation(cv: Cv, s: Scope, bgr: Mat, factor: number): Mat {
  const hsv = s.mat()
  cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV)
  const channels = s.mat(new cv.MatVector())
  cv.split(hsv, channels)
  const sat = s.mat(channels.get(1))
  cv.convertScaleAbs(sat, sat, factor, 0)
  channels.set(1, sat)
  cv.merge(channels, hsv)
  const out = s.mat()
  cv.cvtColor(hsv, out, cv.COLOR_HSV2BGR)
  return out
}

function applyFilter(cv: Cv, s: Scope, bgr: Mat, params: PageParams): Mat {
  switch (params.filter) {
    case 'original':
      return params.removeShadows ? perChannel(cv, s, bgr, (ch) => removeShadow(cv, s, ch)) : bgr
    case 'magic': {
      // CamScanner-style "Magic Color": white paper, vivid ink, no shadows.
      const flat = perChannel(cv, s, bgr, (ch) => removeShadow(cv, s, ch))
      const lab = s.mat()
      cv.cvtColor(flat, lab, cv.COLOR_BGR2Lab)
      const labChannels = s.mat(new cv.MatVector())
      cv.split(lab, labChannels)
      const lightness = s.mat(labChannels.get(0))
      const clahe = new cv.CLAHE(1.5, new cv.Size(8, 8))
      clahe.apply(lightness, lightness)
      clahe.delete()
      labChannels.set(0, lightness)
      cv.merge(labChannels, lab)
      const out = s.mat()
      cv.cvtColor(lab, out, cv.COLOR_Lab2BGR)
      return boostSaturation(cv, s, out, 1.3)
    }
    case 'gray': {
      const gray = toGray(cv, s, bgr)
      const out = params.removeShadows ? removeShadow(cv, s, gray) : gray
      cv.normalize(out, out, 0, 255, cv.NORM_MINMAX)
      return out
    }
    case 'bw': {
      const flat = removeShadow(cv, s, toGray(cv, s, bgr))
      const out = s.mat()
      const block = odd(Math.min(flat.cols, flat.rows) / 40)
      cv.adaptiveThreshold(flat, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, Math.max(15, block), 12)
      return out
    }
  }
}

const ROTATE_CODE: Record<number, string> = { 90: 'ROTATE_90_CLOCKWISE', 180: 'ROTATE_180', 270: 'ROTATE_90_COUNTERCLOCKWISE' }

/** Apply a page's edit recipe to its original image. */
export function processPage(cv: Cv, image: RawImage, params: PageParams): RawImage {
  return withScope(cv, (s) => {
    const src = matFromRaw(cv, s, image)
    let mat = s.mat()
    cv.cvtColor(src, mat, cv.COLOR_BGRA2BGR)

    if (params.corners) {
      const px = params.corners.map((p) => ({ x: p.x * image.width, y: p.y * image.height })) as Quad
      const size = quadOutputSize(px)
      const from = s.mat(cv.matFromArray(4, 1, cv.CV_32FC2, px.flatMap((p) => [p.x, p.y])))
      const to = s.mat(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, size.width, 0, size.width, size.height, 0, size.height]))
      const m = s.mat(cv.getPerspectiveTransform(from, to))
      const warped = s.mat()
      cv.warpPerspective(mat, warped, m, new cv.Size(size.width, size.height), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
      mat = warped
    }

    if (params.rotation !== 0) {
      const rotated = s.mat()
      cv.rotate(mat, rotated, cv[ROTATE_CODE[params.rotation]])
      mat = rotated
    }

    if (params.flipH || params.flipV) {
      const flipped = s.mat()
      cv.flip(mat, flipped, params.flipH && params.flipV ? -1 : params.flipH ? 1 : 0)
      mat = flipped
    }

    if (params.crop) {
      const x = Math.round(params.crop.x * mat.cols)
      const y = Math.round(params.crop.y * mat.rows)
      const w = Math.max(1, Math.min(mat.cols - x, Math.round(params.crop.width * mat.cols)))
      const h = Math.max(1, Math.min(mat.rows - y, Math.round(params.crop.height * mat.rows)))
      const roi = s.mat(mat.roi(new cv.Rect(x, y, w, h)))
      mat = s.mat(roi.clone())
    }

    if (Math.abs(params.angle) >= 0.05) {
      const straightened = s.mat()
      const m = s.mat(cv.getRotationMatrix2D(new cv.Point(mat.cols / 2, mat.rows / 2), params.angle, 1))
      cv.warpAffine(mat, straightened, m, new cv.Size(mat.cols, mat.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
      mat = straightened
    }

    let out = applyFilter(cv, s, mat, params)

    if (params.brightness !== 0 || params.contrast !== 0) {
      const alpha = 1 + params.contrast / 100
      const beta = params.brightness * 1.27 + 128 * (1 - alpha)
      const adjusted = s.mat()
      cv.convertScaleAbs(out, adjusted, alpha, beta)
      out = adjusted
    }
    return rawFromMat(cv, s, out)
  })
}

/** Downscaled copy (longest side ≤ maxSide) for fast analysis such as orientation detection. */
export function resizeForAnalysis(cv: Cv, image: RawImage, maxSide: number): RawImage {
  return withScope(cv, (s) => {
    const src = matFromRaw(cv, s, image)
    const { mat } = downscale(cv, s, src, maxSide)
    return rawFromMat(cv, s, mat)
  })
}
