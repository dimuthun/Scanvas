import { describe, expect, it } from 'vitest'
import { acceleratorFromEvent, formatAccelerator } from '@shared/accelerator'
import { createTranslator, resolveLocale } from '@shared/i18n'

describe('resolveLocale', () => {
  it.each([
    ['en-US', 'en'],
    ['fr', 'en'],
    ['zh-CN', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-Hant-TW', 'zh-TW']
  ])('%s → %s', (tag, expected) => {
    expect(resolveLocale(tag)).toBe(expected)
  })
})

describe('createTranslator', () => {
  it('interpolates parameters', () => {
    expect(createTranslator('en')('resultConfidence', { value: 92 })).toBe('Confidence 92%')
    expect(createTranslator('zh-CN')('resultConfidence', { value: 92 })).toBe('置信度 92%')
  })
})

describe('acceleratorFromEvent', () => {
  const key = (overrides: Partial<Parameters<typeof acceleratorFromEvent>[0]>) => ({
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  })

  it('builds accelerators from physical keys', () => {
    expect(acceleratorFromEvent(key({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }))).toBe('CommandOrControl+Shift+1')
    expect(acceleratorFromEvent(key({ key: 'o', code: 'KeyO', altKey: true }))).toBe('Alt+O')
    expect(acceleratorFromEvent(key({ key: 'F8', code: 'F8' }))).toBe('F8')
  })

  it('rejects bare keys and lone modifiers', () => {
    expect(acceleratorFromEvent(key({ key: 'a', code: 'KeyA' }))).toBeNull()
    expect(acceleratorFromEvent(key({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toBeNull()
  })

  it('formats for display', () => {
    expect(formatAccelerator('CommandOrControl+Shift+1', 'win32')).toBe('Ctrl+Shift+1')
    expect(formatAccelerator('CommandOrControl+Shift+1', 'darwin')).toBe('⌘+Shift+1')
  })
})
