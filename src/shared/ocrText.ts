/** Minimal structural view of Tesseract's `blocks` output that we rely on. */
export interface OcrBlockLike {
  paragraphs: Array<{ text: string }>
}

const CJK = '\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef'
const SPACE_BETWEEN_CJK = new RegExp(`(?<=[${CJK}])[ \\t]+(?=[${CJK}])`, 'g')
const ENDS_WITH_CJK = new RegExp(`[${CJK}]$`)
const STARTS_WITH_CJK = new RegExp(`^[${CJK}]`)

/** Tesseract separates CJK glyphs with spaces; remove those but keep spaces around Latin words. */
export function removeCjkSpaces(text: string): string {
  return text.replace(SPACE_BETWEEN_CJK, '')
}

/** Paragraph texts (line breaks preserved) from Tesseract blocks, empty paragraphs dropped. */
export function paragraphsFromBlocks(blocks: OcrBlockLike[] | null | undefined): string[] {
  if (!blocks) return []
  return blocks
    .flatMap((block) => block.paragraphs)
    .map((paragraph) =>
      paragraph.text
        .split('\n')
        .map((line) => removeCjkSpaces(line.trim()))
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean)
}

/**
 * Re-flow a paragraph into a single line: de-hyphenates words broken across
 * lines and joins CJK lines without inserting a space.
 */
export function joinLines(paragraph: string): string {
  const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean)
  let out = ''
  for (const line of lines) {
    if (!out) {
      out = line
    } else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(line)) {
      out = out.slice(0, -1) + line
    } else if (ENDS_WITH_CJK.test(out) || STARTS_WITH_CJK.test(line)) {
      out += line
    } else {
      out += ' ' + line
    }
  }
  return out
}

export function paragraphsToText(paragraphs: string[], reflow = false): string {
  return (reflow ? paragraphs.map(joinLines) : paragraphs).join('\n\n')
}
