import type { Worker } from 'node:worker_threads'
import type { PageParams, Quad } from '@shared/types'
import type { RawImage } from './ops'
import type { ImagingRequest, ImagingResponse, ImagingResults } from './protocol'
import createImagingWorker from './worker?nodeWorker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

function getWorker(): Worker {
  if (worker) return worker
  const w = createImagingWorker({})
  w.on('message', (response: ImagingResponse) => {
    const entry = pending.get(response.id)
    if (!entry) return
    pending.delete(response.id)
    if (response.ok) entry.resolve(response.result)
    else entry.reject(new Error(response.error))
  })
  w.on('error', (error: unknown) => {
    const failure = error instanceof Error ? error : new Error(String(error))
    for (const entry of pending.values()) entry.reject(failure)
    pending.clear()
    worker = null
  })
  w.on('exit', () => {
    worker = null
  })
  worker = w
  return w
}

function call<K extends keyof ImagingResults>(request: ImagingRequest & { op: K }): Promise<ImagingResults[K]> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    // Images are copied (not transferred) so callers can keep using their buffers.
    getWorker().postMessage({ ...request, id })
  })
}

export const imaging = {
  detect: (image: RawImage): Promise<Quad | null> => call({ op: 'detect', image }),
  process: (image: RawImage, params: PageParams): Promise<RawImage> => call({ op: 'process', image, params }),
  skew: (image: RawImage): Promise<number> => call({ op: 'skew', image }),
  gutter: (image: RawImage): Promise<number | null> => call({ op: 'gutter', image }),
  resize: (image: RawImage, maxSide: number): Promise<RawImage> => call({ op: 'resize', image, maxSide })
}

export async function shutdownImaging(): Promise<void> {
  const w = worker
  worker = null
  await w?.terminate()
}
