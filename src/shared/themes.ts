import type { AccentId, ThemeId } from './types'

/**
 * Theme presets ("modern glass"): every preset is a full set of design
 * tokens; the accent is layered on top. Used by renderers (CSS custom
 * properties) and by the main process (title-bar overlay + window colors).
 */

export type ThemeBase = 'light' | 'dark'
export type PresetId = Exclude<ThemeId, 'system'>

interface Preset {
  base: ThemeBase
  accent: Exclude<AccentId, 'theme'>
  bg: string
  /** Aurora backdrop: layered gradients painted behind the glass panels. */
  bgImage: string
  /** Translucent glass surface. */
  surface: string
  /** Opaque equivalent of `surface` (transparency off, popovers). */
  surfaceSolid: string
  /** Subtle fill for inputs, hovers and wells. */
  surface2: string
  border: string
  text: string
  textMuted: string
  /** Opaque title-bar color, shared with the native window-controls overlay. */
  titleBar: string
}

const radial = (at: string, color: string, size = '45%'): string => `radial-gradient(at ${at}, ${color}, transparent ${size})`

export const PRESETS: Record<PresetId, Preset> = {
  light: {
    base: 'light',
    accent: 'blue',
    bg: '#eef2f8',
    bgImage: [
      radial('12% 6%', 'rgba(99, 102, 241, 0.22)'),
      radial('92% 10%', 'rgba(236, 72, 153, 0.15)', '42%'),
      radial('70% 100%', 'rgba(14, 165, 233, 0.18)', '50%'),
      'linear-gradient(160deg, #f6f8fc, #e8edf6)'
    ].join(', '),
    surface: 'rgba(255, 255, 255, 0.62)',
    surfaceSolid: '#ffffff',
    surface2: 'rgba(15, 23, 42, 0.05)',
    border: 'rgba(15, 23, 42, 0.10)',
    text: '#141821',
    textMuted: '#5b6474',
    titleBar: '#f3f5fa'
  },
  dark: {
    base: 'dark',
    accent: 'blue',
    bg: '#101216',
    bgImage: [
      radial('15% 8%', 'rgba(59, 130, 246, 0.20)'),
      radial('88% 90%', 'rgba(168, 85, 247, 0.14)', '50%'),
      'linear-gradient(160deg, #14161b, #0c0e12)'
    ].join(', '),
    surface: 'rgba(30, 33, 40, 0.62)',
    surfaceSolid: '#1c1f25',
    surface2: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.09)',
    text: '#e8eaee',
    textMuted: '#9aa3b0',
    titleBar: '#16181d'
  },
  midnight: {
    base: 'dark',
    accent: 'violet',
    bg: '#0a0e1f',
    bgImage: [
      radial('20% 0%', 'rgba(124, 58, 237, 0.32)', '50%'),
      radial('92% 30%', 'rgba(37, 99, 235, 0.22)'),
      radial('50% 100%', 'rgba(219, 39, 119, 0.14)', '50%'),
      'linear-gradient(160deg, #0d1228, #070a17)'
    ].join(', '),
    surface: 'rgba(22, 28, 56, 0.58)',
    surfaceSolid: '#151b36',
    surface2: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(160, 170, 255, 0.14)',
    text: '#e9ebff',
    textMuted: '#a2a8cc',
    titleBar: '#0f1430'
  },
  ocean: {
    base: 'dark',
    accent: 'cyan',
    bg: '#061a22',
    bgImage: [
      radial('10% 0%', 'rgba(6, 182, 212, 0.28)', '50%'),
      radial('85% 5%', 'rgba(37, 99, 235, 0.18)'),
      radial('90% 95%', 'rgba(20, 184, 166, 0.18)', '50%'),
      'linear-gradient(160deg, #08232d, #04121a)'
    ].join(', '),
    surface: 'rgba(10, 42, 54, 0.55)',
    surfaceSolid: '#0c2a35',
    surface2: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(125, 211, 252, 0.14)',
    text: '#e3f6fb',
    textMuted: '#8fb6c2',
    titleBar: '#08202a'
  },
  forest: {
    base: 'dark',
    accent: 'green',
    bg: '#0b1510',
    bgImage: [
      radial('15% 5%', 'rgba(34, 197, 94, 0.20)', '50%'),
      radial('85% 10%', 'rgba(132, 204, 22, 0.09)'),
      radial('90% 95%', 'rgba(16, 185, 129, 0.16)', '50%'),
      'linear-gradient(160deg, #0e1c14, #07100b)'
    ].join(', '),
    surface: 'rgba(20, 38, 28, 0.58)',
    surfaceSolid: '#14271c',
    surface2: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(134, 239, 172, 0.12)',
    text: '#e6f4ea',
    textMuted: '#95b09f',
    titleBar: '#0f1e16'
  },
  sunset: {
    base: 'light',
    accent: 'orange',
    bg: '#fdf1ea',
    bgImage: [
      radial('0% 0%', 'rgba(251, 146, 60, 0.30)', '50%'),
      radial('100% 8%', 'rgba(244, 63, 94, 0.20)'),
      radial('60% 100%', 'rgba(168, 85, 247, 0.14)', '50%'),
      'linear-gradient(160deg, #fff6f0, #fbe6e3)'
    ].join(', '),
    surface: 'rgba(255, 255, 255, 0.58)',
    surfaceSolid: '#fffaf7',
    surface2: 'rgba(120, 53, 15, 0.06)',
    border: 'rgba(120, 53, 15, 0.12)',
    text: '#2a1a14',
    textMuted: '#7c5d50',
    titleBar: '#fdeee6'
  },
  paper: {
    base: 'light',
    accent: 'amber',
    bg: '#f6f1e7',
    bgImage: [radial('85% 0%', 'rgba(217, 119, 6, 0.10)', '55%'), 'linear-gradient(170deg, #f9f5ee, #f0e9da)'].join(', '),
    surface: 'rgba(255, 253, 248, 0.82)',
    surfaceSolid: '#fffdf8',
    surface2: 'rgba(87, 63, 24, 0.06)',
    border: 'rgba(87, 63, 24, 0.14)',
    text: '#2b2418',
    textMuted: '#7a6c55',
    titleBar: '#f4eee2'
  }
}

/** Accent colors: [for light themes, for dark themes]. */
export const ACCENTS: Record<Exclude<AccentId, 'theme'>, [string, string]> = {
  blue: ['#2563eb', '#3b82f6'],
  // violet-500 fails WCAG AA with both black and white text, so dark themes use violet-400.
  violet: ['#7c3aed', '#a78bfa'],
  pink: ['#db2777', '#ec4899'],
  red: ['#dc2626', '#ef4444'],
  orange: ['#ea580c', '#f97316'],
  amber: ['#d97706', '#f59e0b'],
  green: ['#16a34a', '#22c55e'],
  teal: ['#0d9488', '#14b8a6'],
  cyan: ['#0891b2', '#06b6d4']
}

const STATUS: Record<ThemeBase, { danger: string; success: string; warning: string }> = {
  light: { danger: '#dc2626', success: '#15803d', warning: '#b45309' },
  dark: { danger: '#f87171', success: '#4ade80', warning: '#fbbf24' }
}

// ---------------------------------------------------------------- color math

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

/** Mix `amount` (0–1) of `other` into `color`. */
export function mix(color: string, other: string, amount: number): string {
  const a = hexToRgb(color)
  const b = hexToRgb(other)
  return rgbToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number])
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Black or white text, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#111111') ? '#ffffff' : '#111111'
}

// ---------------------------------------------------------------- resolution

export interface ThemeInput {
  theme: ThemeId
  accent: AccentId
  transparency: boolean
}

export interface ResolvedTheme {
  id: PresetId
  base: ThemeBase
  accent: string
  tokens: Record<string, string>
  titleBar: { color: string; symbolColor: string }
}

export function resolvePreset(theme: ThemeId, osDark: boolean): PresetId {
  if (theme === 'system') return osDark ? 'dark' : 'light'
  return theme
}

export function resolveTheme(input: ThemeInput, osDark: boolean): ResolvedTheme {
  const id = resolvePreset(input.theme, osDark)
  const preset = PRESETS[id]
  const accentId = input.accent === 'theme' ? preset.accent : input.accent
  const accent = ACCENTS[accentId][preset.base === 'light' ? 0 : 1]
  const dark = preset.base === 'dark'
  const status = STATUS[preset.base]
  const glass = input.transparency

  const tokens: Record<string, string> = {
    '--bg': preset.bg,
    '--bg-image': preset.bgImage,
    '--surface': glass ? preset.surface : preset.surfaceSolid,
    '--surface-strong': preset.surfaceSolid,
    '--surface-2': preset.surface2,
    '--border': preset.border,
    '--text': preset.text,
    '--text-muted': preset.textMuted,
    '--title-bar': preset.titleBar,
    '--accent': accent,
    '--accent-hover': mix(accent, dark ? '#ffffff' : '#000000', 0.14),
    '--accent-soft': withAlpha(accent, dark ? 0.22 : 0.14),
    '--accent-text': readableOn(accent),
    '--danger': status.danger,
    '--success': status.success,
    '--warning': status.warning,
    '--shadow': dark
      ? '0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.35)'
      : '0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.08)',
    '--shadow-lg': dark ? '0 24px 64px rgba(0, 0, 0, 0.55)' : '0 24px 64px rgba(16, 24, 40, 0.18)',
    '--blur': glass ? '18px' : '0px',
    '--radius': '10px',
    '--radius-lg': '16px'
  }
  return { id, base: preset.base, accent, tokens, titleBar: { color: preset.titleBar, symbolColor: preset.text } }
}
