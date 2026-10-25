import { nativeImage } from 'electron'
import type { ImageExt } from '@shared/types'
import type { RawImage } from './ops'

/**
 * Decode PNG/JPEG via Chromium's codecs. Bitmaps are BGRA on all supported
 * (little-endian) platforms, matching what the OpenCV ops expect.
 */
export function decodeImage(source: string | Buffer): RawImage {
  const image = typeof source === 'string' ? nativeImage.createFromPath(source) : nativeImage.createFromBuffer(source)
  if (image.isEmpty()) throw new Error('Unsupported or corrupt image')
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  return { width, height, data: new Uint8Array(bitmap.buffer, bitmap.byteOffset, bitmap.byteLength) }
}

function toNative(image: RawImage): Electron.NativeImage {
  const buffer = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength)
  return nativeImage.createFromBitmap(buffer, { width: image.width, height: image.height })
}

export function encodeImage(image: RawImage, ext: ImageExt, jpegQuality = 92): Buffer {
  const native = toNative(image)
  return ext === 'png' ? native.toPNG() : native.toJPEG(jpegQuality)
}

/** Re-encode an encoded image so its longest side is at most `maxSide`. */
export function shrinkEncoded(bytes: Buffer, maxSide: number, ext: ImageExt, jpegQuality: number): Buffer {
  const image = nativeImage.createFromBuffer(bytes)
  const { width, height } = image.getSize()
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const resized =
    scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' }) : image
  return ext === 'png' ? resized.toPNG() : resized.toJPEG(jpegQuality)
}

export function encodeThumbnail(image: RawImage, width = 320): Buffer {
  const native = toNative(image)
  const scale = Math.min(1, width / image.width)
  return native.resize({ width: Math.round(image.width * scale), quality: 'good' }).toJPEG(80)
}
