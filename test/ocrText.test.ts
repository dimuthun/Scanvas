import { describe, expect, it } from 'vitest'
import { joinLines, paragraphsFromBlocks, paragraphsToText, removeCjkSpaces } from '@shared/ocrText'

describe('removeCjkSpaces', () => {
  it('removes spaces Tesseract puts between CJK glyphs only', () => {
    expect(removeCjkSpaces('扫 描 全 能 王 CamScanner 桌 面 版')).toBe('扫描全能王 CamScanner 桌面版')
  })
})

describe('paragraphsFromBlocks', () => {
  it('flattens blocks into trimmed paragraphs and drops empty ones', () => {
    const blocks = [
      { paragraphs: [{ text: 'Hello world\nsecond line \n' }, { text: '   \n' }] },
      { paragraphs: [{ text: '你 好 世 界\n' }] }
    ]
    expect(paragraphsFromBlocks(blocks)).toEqual(['Hello world\nsecond line', '你好世界'])
  })

  it('handles missing blocks', () => {
    expect(paragraphsFromBlocks(null)).toEqual([])
  })
})

describe('joinLines', () => {
  it('joins Latin lines with spaces and repairs hyphenation', () => {
    expect(joinLines('The quick brown\nfox jumps over the lazy dog. Docu-\nments are scanned')).toBe(
      'The quick brown fox jumps over the lazy dog. Documents are scanned'
    )
  })

  it('keeps hyphens before capitals (real compound words)', () => {
    expect(joinLines('Coca-\nCola')).toBe('Coca- Cola')
  })

  it('joins CJK lines without spaces', () => {
    expect(joinLines('第一行文字\n第二行文字')).toBe('第一行文字第二行文字')
  })
})

describe('paragraphsToText', () => {
  it('separates paragraphs with a blank line, optionally reflowed', () => {
    expect(paragraphsToText(['a\nb', 'c'])).toBe('a\nb\n\nc')
    expect(paragraphsToText(['a\nb', 'c'], true)).toBe('a b\n\nc')
  })
})
