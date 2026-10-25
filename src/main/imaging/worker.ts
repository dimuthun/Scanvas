import { parentPort } from 'node:worker_threads'
import { loadOpenCv } from './loadCv'
import { detectDocument, detectGutter, measureSkew, processPage, resizeForAnalysis, type Cv, type RawImage } from './ops'
import type { ImagingRequest, ImagingResponse, ImagingResults } from './protocol'

// Runs OpenCV off the main thread so image processing never blocks the UI or IPC.
const port = parentPort!
const cvReady = loadOpenCv()

function run(cv: Cv, request: ImagingRequest): ImagingResults[keyof ImagingResults] {
  switch (request.op) {
    case 'detect':
      return detectDocument(cv, request.image)
    case 'process':
      return processPage(cv, request.image, request.params)
    case 'skew':
      return measureSkew(cv, request.image)
    case 'gutter':
      return detectGutter(cv, request.image)
    case 'resize':
      return resizeForAnalysis(cv, request.image, request.maxSide)
  }
}

port.on('message', async (message: ImagingRequest & { id: number }) => {
  let response: ImagingResponse
  const transfer: ArrayBuffer[] = []
  try {
    const result = run(await cvReady, message)
    if (result && typeof result === 'object' && 'data' in result) transfer.push((result as RawImage).data.buffer as ArrayBuffer)
    response = { id: message.id, ok: true, result }
  } catch (error) {
    response = { id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  port.postMessage(response, transfer)
})
