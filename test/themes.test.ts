import { describe, expect, it } from 'vitest'
import { ACCENTS, contrastRatio, mix, PRESETS, readableOn, resolvePreset, resolveTheme, type PresetId } from '@shared/themes'
import { ACCENT_IDS, THEME_IDS } from '@shared/types'

const REQUIRED_TOKENS = [
  '--bg',
  '--bg-image',
  '--surface',
  '--surface-strong',
  '--surface-2',
  '--border',
  '--text',
  '--text-muted',
  '--title-bar',
  '--accent',
  '--accent-hover',
  '--accent-soft',
  '--accent-text',
  '--danger',
  '--success',
  '--warning',
  '--shadow',
  '--shadow-lg',
  '--blur',
  '--radius',
  '--radius-lg'
]
const HEX = /^#[0-9a-f]{6}$/i

describe('presets', () => {
  it('covers every theme id except system', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(THEME_IDS.filter((id) => id !== 'system').sort())
  })

  it.each(THEME_IDS)('%s defines every token and valid title-bar colors', (theme) => {
    for (const accent of ACCENT_IDS) {
      const resolved = resolveTheme({ theme, accent, transparency: true }, false)
      for (const token of REQUIRED_TOKENS) expect(resolved.tokens[token], `${theme}/${accent} ${token}`).toBeTruthy()
      expect(resolved.titleBar.color).toMatch(HEX)
      expect(resolved.titleBar.symbolColor).toMatch(HEX)
    }
  })

  it.each(Object.keys(PRESETS) as PresetId[])('%s body text is readable on its title bar (≥ 7:1)', (id) => {
    expect(contrastRatio(PRESETS[id].text, PRESETS[id].titleBar)).toBeGreaterThanOrEqual(7)
  })
})

describe('resolveTheme', () => {
  it('follows the OS for "system"', () => {
    expect(resolvePreset('system', true)).toBe('dark')
    expect(resolvePreset('system', false)).toBe('light')
    expect(resolvePreset('midnight', false)).toBe('midnight')
  })

  it('uses the preset accent for "theme" and the light/dark variant of a chosen accent', () => {
    expect(resolveTheme({ theme: 'midnight', accent: 'theme', transparency: true }, false).accent).toBe(ACCENTS.violet[1])
    expect(resolveTheme({ theme: 'sunset', accent: 'teal', transparency: true }, false).accent).toBe(ACCENTS.teal[0])
  })

  it('switches to solid surfaces when transparency is off', () => {
    const solid = resolveTheme({ theme: 'light', accent: 'theme', transparency: false }, false)
    expect(solid.tokens['--blur']).toBe('0px')
    expect(solid.tokens['--surface']).toBe(PRESETS.light.surfaceSolid)
  })

  it.each(Object.entries(ACCENTS))('text on the %s accent reaches WCAG AA (≥ 4.5:1)', (_name, variants) => {
    for (const accent of variants) expect(contrastRatio(accent, readableOn(accent))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('color math', () => {
  it('mixes colors linearly', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#2563eb', '#2563eb', 0.3)).toBe('#2563eb')
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1)
  })
})
