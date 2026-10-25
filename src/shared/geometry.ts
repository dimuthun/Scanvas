import type { Rect, Size } from './types'

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Rectangle spanned by two drag points, regardless of drag direction. */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}

/** Keep a rectangle inside `bounds` (origin 0,0), shrinking it if necessary. */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const x = Math.min(Math.max(rect.x, 0), bounds.width)
  const y = Math.min(Math.max(rect.y, 0), bounds.height)
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.x + rect.width, bounds.width) - x),
    height: Math.max(0, Math.min(rect.y + rect.height, bounds.height) - y)
  }
}

/** Move a rectangle by (dx, dy) without letting it leave `bounds`. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...rect,
    x: Math.min(Math.max(rect.x + dx, 0), bounds.width - rect.width),
    y: Math.min(Math.max(rect.y + dy, 0), bounds.height - rect.height)
  }
}

/** Drag one edge/corner handle of a rectangle; flips cleanly when dragged past the opposite edge. */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, bounds: Size): Rect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  return clampRect(rectFromPoints(left, top, right, bottom), bounds)
}

/**
 * Map a selection made on the overlay (CSS pixels of a view of `viewSize`)
 * to integer pixel coordinates of the captured image (`imageSize`, usually
 * view size × display scale factor). Result is clamped to the image.
 */
export function toImageRect(rect: Rect, viewSize: Size, imageSize: Size): Rect {
  const sx = imageSize.width / viewSize.width
  const sy = imageSize.height / viewSize.height
  const x = Math.round(rect.x * sx)
  const y = Math.round(rect.y * sy)
  const right = Math.round((rect.x + rect.width) * sx)
  const bottom = Math.round((rect.y + rect.height) * sy)
  return clampRect({ x, y, width: right - x, height: bottom - y }, imageSize)
}

/**
 * Where to put the confirm toolbar: just below the selection's bottom-right,
 * flipped above (or inside) when there is not enough room below.
 */
export function toolbarPosition(rect: Rect, toolbar: Size, view: Size, gap = 8): { x: number; y: number } {
  const x = Math.min(Math.max(rect.x + rect.width - toolbar.width, 0), Math.max(0, view.width - toolbar.width))
  const below = rect.y + rect.height + gap
  if (below + toolbar.height <= view.height) return { x, y: below }
  const above = rect.y - gap - toolbar.height
  if (above >= 0) return { x, y: above }
  return { x, y: Math.max(0, rect.y + rect.height - toolbar.height - gap) }
}
