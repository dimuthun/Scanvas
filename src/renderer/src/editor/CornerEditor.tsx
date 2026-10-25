import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FULL_QUAD } from '@shared/pageMath'
import type { Point, Quad } from '@shared/types'

interface Props {
  imageUrl: string
  /** Original image size in pixels (for the aspect ratio). */
  width: number
  height: number
  corners: Quad
  onChange(corners: Quad): void
}

const LOUPE = 120
const ZOOM = 3

/** Four draggable page corners over the original photo, with a magnifier while dragging. */
export function CornerEditor({ imageUrl, width, height, corners, onChange }: Props): React.JSX.Element {
  const frame = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState<number | null>(null)

  // Fit the image into the available area while keeping its aspect ratio.
  useLayoutEffect(() => {
    const element = frame.current?.parentElement
    if (!element) return
    const fit = (): void => {
      const availableW = element.clientWidth - 48
      const availableH = element.clientHeight - 48
      const scale = Math.min(availableW / width, availableH / height)
      setBox({ width: Math.max(1, width * scale), height: Math.max(1, height * scale) })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [width, height])

  useEffect(() => {
    if (dragging === null) return
    const move = (event: PointerEvent): void => {
      const rect = frame.current!.getBoundingClientRect()
      const point: Point = {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
      }
      const next = [...corners] as Quad
      next[dragging] = point
      onChange(next)
    }
    const up = (): void => setDragging(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, corners, onChange])

  const px = (p: Point): { x: number; y: number } => ({ x: p.x * box.width, y: p.y * box.height })
  const polygon = corners.map((p) => `${px(p).x},${px(p).y}`).join(' ')
  const active = dragging !== null ? corners[dragging] : null

  return (
    <div className="corner-editor" ref={frame} style={{ width: box.width, height: box.height }}>
      <img src={imageUrl} alt="" draggable={false} />
      <svg width={box.width} height={box.height}>
        <defs>
          <mask id="page-mask">
            <rect width="100%" height="100%" fill="white" />
            <polygon points={polygon} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#page-mask)" />
        <polygon points={polygon} fill="none" stroke="#3b82f6" strokeWidth={2} />
      </svg>
      {corners.map((corner, i) => (
        <div
          key={i}
          className={`corner${dragging === i ? ' dragging' : ''}`}
          style={{ left: px(corner).x, top: px(corner).y }}
          onPointerDown={(event) => {
            event.preventDefault()
            setDragging(i)
          }}
        />
      ))}
      {active && (
        <div
          className="loupe"
          style={{
            width: LOUPE,
            height: LOUPE,
            left: px(active).x < box.width / 2 ? box.width - LOUPE - 8 : 8,
            top: 8,
            backgroundImage: `url("${imageUrl}")`,
            backgroundSize: `${box.width * ZOOM}px ${box.height * ZOOM}px`,
            backgroundPosition: `${LOUPE / 2 - px(active).x * ZOOM}px ${LOUPE / 2 - px(active).y * ZOOM}px`
          }}
        >
          <div className="crosshair" />
        </div>
      )}
    </div>
  )
}

export function cornersOrFull(corners: Quad | null): Quad {
  return corners ?? FULL_QUAD
}
