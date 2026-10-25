// Copies offline assets out of node_modules:
//  - Tesseract language models (+ the legacy OSD model) → resources/tessdata
//  - pdf.js CMaps, standard fonts and wasm decoders → src/renderer/public/pdfjs
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources', 'tessdata')
const models = [
  ['eng', '4.0.0_best_int'],
  ['chi_sim', '4.0.0_best_int'],
  ['chi_tra', '4.0.0_best_int'],
  // Orientation detection runs on the legacy engine, which needs the non-"best_int" model.
  ['osd', '4.0.0']
]

mkdirSync(outDir, { recursive: true })
for (const [lang, variant] of models) {
  const src = join(root, 'node_modules', '@tesseract.js-data', lang, variant, `${lang}.traineddata.gz`)
  const dest = join(outDir, `${lang}.traineddata.gz`)
  if (!existsSync(src)) {
    console.error(`[tessdata] missing ${src} — run npm install`)
    process.exitCode = 1
    continue
  }
  if (!existsSync(dest)) copyFileSync(src, dest)
}
console.log(`[tessdata] ${models.map(([lang]) => lang).join(', ')} ready in ${outDir}`)

const pdfjsOut = join(root, 'src', 'renderer', 'public', 'pdfjs')
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  const src = join(root, 'node_modules', 'pdfjs-dist', dir)
  if (existsSync(src)) cpSync(src, join(pdfjsOut, dir), { recursive: true })
}
console.log(`[pdfjs] assets ready in ${pdfjsOut}`)
