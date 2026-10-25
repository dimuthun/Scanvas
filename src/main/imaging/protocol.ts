import type { PageParams, Quad } from '@shared/types'
import type { RawImage } from './ops'

/** Messages between the main process and the OpenCV worker thread. */
export type ImagingRequest =
  | { op: 'detect'; image: RawImage }
  | { op: 'process'; image: RawImage; params: PageParams }
  | { op: 'skew'; image: RawImage }
  | { op: 'gutter'; image: RawImage }
  | { op: 'resize'; image: RawImage; maxSide: number }

export interface ImagingResults {
  detect: Quad | null
  process: RawImage
  skew: number
  gutter: number | null
  resize: RawImage
}

export type ImagingResponse =
  | { id: number; ok: true; result: ImagingResults[keyof ImagingResults] }
  | { id: number; ok: false; error: string }
