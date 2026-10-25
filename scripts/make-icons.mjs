// Generates the tray and app icons (a "scan frame + text lines" glyph) as PNGs.
// Run with: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icons')
mkdirSync(outDir, { recursive: true })

function encodePng(size, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Glyph in unit coordinates: four corner brackets and three text lines.
function glyph(x, y, stroke) {
  const r = stroke / 2
  const a = 0.1
  const b = 0.9
  const len = 0.26
  const corners = [
    [a, a, 1, 1], [b, a, -1, 1], [a, b, 1, -1], [b, b, -1, -1]
  ]
  for (const [cx, cy, sx, sy] of corners) {
    if (segDist(x, y, cx, cy, cx + sx * len, cy) <= r) return true
    if (segDist(x, y, cx, cy, cx, cy + sy * len) <= r) return true
  }
  const lines = [[0.3, 0.38, 0.7], [0.3, 0.5, 0.7], [0.3, 0.62, 0.58]]
  return lines.some(([x1, ly, x2]) => segDist(x, y, x1, ly, x2, ly) <= r)
}

function roundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius)
  const cy = Math.min(Math.max(y, radius), 1 - radius)
  return Math.hypot(x - cx, y - cy) <= radius
}

function render(size, shade) {
  const ss = 4
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0, 0]
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [r, g, b, a] = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)
          acc = [acc[0] + r * a, acc[1] + g * a, acc[2] + b * a, acc[3] + a]
        }
      }
      const alpha = acc[3] / (ss * ss)
      const i = (py * size + px) * 4
      if (alpha > 0) {
        rgba[i] = Math.round(acc[0] / acc[3])
        rgba[i + 1] = Math.round(acc[1] / acc[3])
        rgba[i + 2] = Math.round(acc[2] / acc[3])
      }
      rgba[i + 3] = Math.round(alpha * 255)
    }
  }
  return encodePng(size, rgba)
}

const trayShade = (color) => (x, y) => (glyph(x, y, 0.11) ? [...color, 1] : [0, 0, 0, 0])
const appShade = (x, y) => {
  if (!roundedSquare(x, y, 0.22)) return [0, 0, 0, 0]
  const inner = (x - 0.15) / 0.7
  const innerY = (y - 0.15) / 0.7
  if (inner >= 0 && inner <= 1 && innerY >= 0 && innerY <= 1 && glyph(inner, innerY, 0.085)) return [255, 255, 255, 1]
  const t = (x + y) / 2
  return [Math.round(37 - 8 * t), Math.round(99 - 21 * t), Math.round(235 - 19 * t), 1]
}

const files = {
  'tray.png': render(16, trayShade([32, 32, 32])),
  'tray@2x.png': render(32, trayShade([32, 32, 32])),
  'tray-dark.png': render(16, trayShade([255, 255, 255])),
  'tray-dark@2x.png': render(32, trayShade([255, 255, 255])),
  'icon.png': render(512, appShade)
}
for (const [name, png] of Object.entries(files)) writeFileSync(join(outDir, name), png)
console.log(`[icons] wrote ${Object.keys(files).join(', ')} to ${outDir}`)

/** Windows .ico with PNG-compressed entries (supported since Vista) for the installer and shortcuts. */
function encodeIco(sizes) {
  const images = sizes.map((size) => ({ size, png: render(size, appShade) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + entries.length
  images.forEach(({ size, png }, i) => {
    const e = i * 16
    entries.writeUInt8(size >= 256 ? 0 : size, e) // 0 means 256
    entries.writeUInt8(size >= 256 ? 0 : size, e + 1)
    entries.writeUInt8(0, e + 2) // palette
    entries.writeUInt8(0, e + 3) // reserved
    entries.writeUInt16LE(1, e + 4) // color planes
    entries.writeUInt16LE(32, e + 6) // bits per pixel
    entries.writeUInt32LE(png.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, entries, ...images.map((image) => image.png)])
}

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
mkdirSync(buildDir, { recursive: true })
writeFileSync(join(buildDir, 'icon.ico'), encodeIco([16, 24, 32, 48, 64, 128, 256]))
writeFileSync(join(outDir, 'icon.ico'), encodeIco([16, 24, 32, 48, 64, 128, 256]))
console.log(`[icons] wrote icon.ico to ${buildDir} and ${outDir}`)
