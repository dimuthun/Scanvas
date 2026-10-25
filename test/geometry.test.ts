import { describe, expect, it } from 'vitest'
import { clampRect, moveRect, rectFromPoints, resizeRect, toImageRect, toolbarPosition } from '@shared/geometry'

const view = { width: 1920, height: 1080 }

describe('rectFromPoints', () => {
  it('normalizes drags in any direction', () => {
    expect(rectFromPoints(100, 200, 40, 50)).toEqual({ x: 40, y: 50, width: 60, height: 150 })
  })
})

describe('clampRect', () => {
  it('trims a rectangle that leaves the bounds', () => {
    expect(clampRect({ x: -10, y: 1000, width: 50, height: 200 }, view)).toEqual({ x: 0, y: 1000, width: 40, height: 80 })
  })
})

describe('moveRect', () => {
  it('stops at the edges instead of shrinking', () => {
    expect(moveRect({ x: 1800, y: 10, width: 100, height: 50 }, 500, -40, view)).toEqual({ x: 1820, y: 0, width: 100, height: 50 })
  })
})

describe('resizeRect', () => {
  it('drags the south-east corner', () => {
    expect(resizeRect({ x: 10, y: 10, width: 100, height: 100 }, 'se', 20, -30, view)).toEqual({ x: 10, y: 10, width: 120, height: 70 })
  })

  it('flips when dragged past the opposite edge', () => {
    expect(resizeRect({ x: 100, y: 100, width: 50, height: 50 }, 'w', 80, 0, view)).toEqual({ x: 150, y: 100, width: 30, height: 50 })
  })
})

describe('toImageRect', () => {
  it('scales CSS pixels to device pixels on a HiDPI display', () => {
    const imageSize = { width: 3840, height: 2160 }
    expect(toImageRect({ x: 10.4, y: 20, width: 100.2, height: 50 }, view, imageSize)).toEqual({
      x: 21,
      y: 40,
      width: 200,
      height: 100
    })
  })

  it('handles thumbnails smaller than the display', () => {
    const imageSize = { width: 960, height: 540 }
    expect(toImageRect({ x: 0, y: 0, width: 1920, height: 1080 }, view, imageSize)).toEqual({ x: 0, y: 0, ...imageSize })
  })

  it('clamps to the image', () => {
    expect(toImageRect({ x: 1900, y: 1070, width: 100, height: 100 }, view, view)).toEqual({ x: 1900, y: 1070, width: 20, height: 10 })
  })
})

describe('toolbarPosition', () => {
  const toolbar = { width: 92, height: 40 }

  it('sits below the selection, right-aligned', () => {
    expect(toolbarPosition({ x: 100, y: 100, width: 300, height: 200 }, toolbar, view)).toEqual({ x: 308, y: 308 })
  })

  it('flips above when the selection touches the bottom', () => {
    expect(toolbarPosition({ x: 100, y: 800, width: 300, height: 270 }, toolbar, view)).toEqual({ x: 308, y: 752 })
  })

  it('goes inside a full-screen selection', () => {
    expect(toolbarPosition({ x: 0, y: 0, width: 1920, height: 1080 }, toolbar, view)).toEqual({ x: 1828, y: 1032 })
  })
})
