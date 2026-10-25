import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export interface DecodedCode {
  format: string
  text: string
}

// Load the decoder from the bundled .wasm instead of the default CDN (the app is fully offline).
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
  }
})

/** Decode every QR code / barcode in an image data URL. Returns [] when there are none. */
export async function decodeCodes(imageDataUrl: string): Promise<DecodedCode[]> {
  const blob = await (await fetch(imageDataUrl)).blob()
  const results = await readBarcodes(blob, { tryHarder: true, maxNumberOfSymbols: 16 })
  const seen = new Set<string>()
  return results
    .filter((r) => r.isValid && r.text)
    .map((r) => ({ format: String(r.format), text: r.text }))
    .filter((code) => {
      const key = `${code.format}:${code.text}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function isWebLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}
