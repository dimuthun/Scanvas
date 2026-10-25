import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'] as const

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  webp: 'image/webp',
  gif: 'image/gif'
}

/** 40 MB of base64 ≈ 30 MB image — far beyond any screenshot or phone photo. */
const MAX_DATA_URL_LENGTH = 40 * 1024 * 1024
const DATA_URL = /^data:(image\/(?:png|jpeg|bmp|webp|gif));base64,([A-Za-z0-9+/=]+)$/

export interface DecodedImage {
  mime: string
  bytes: Buffer
  dataUrl: string
}

/** Parse and validate an untrusted image data URL coming from a renderer. */
export function decodeImageDataUrl(input: unknown): DecodedImage {
  if (typeof input !== 'string' || input.length > MAX_DATA_URL_LENGTH) throw new Error('Invalid image')
  const match = DATA_URL.exec(input)
  if (!match) throw new Error('Unsupported image data')
  return { mime: match[1], bytes: Buffer.from(match[2], 'base64'), dataUrl: input }
}

export async function readImageFile(path: string): Promise<DecodedImage> {
  const mime = MIME[extname(path).slice(1).toLowerCase()]
  if (!mime) throw new Error(`Unsupported image type: ${path}`)
  const bytes = await readFile(path)
  return { mime, bytes, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` }
}
