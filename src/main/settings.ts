import { EventEmitter } from 'node:events'
import { app } from 'electron'
import Store from 'electron-store'
import { z } from 'zod'
import { resolveLocale } from '@shared/i18n'
import { ACCENT_IDS, FILTERS, HOTKEY_ACTIONS, OCR_LANGUAGES, THEME_IDS, type Locale, type Settings } from '@shared/types'

interface StoreShape {
  settings: Settings
  welcomed: boolean
}

const accelerator = z.string().max(64)
const folderPath = z.string().max(1024)
const filter = z.enum(FILTERS)

const settingsPatchSchema = z
  .object({
    hotkeys: z.object(Object.fromEntries(HOTKEY_ACTIONS.map((action) => [action, accelerator])) as Record<
      (typeof HOTKEY_ACTIONS)[number],
      typeof accelerator
    >),
    ocrLanguages: z.array(z.enum(OCR_LANGUAGES)).min(1),
    autoCopy: z.boolean(),
    theme: z.enum(THEME_IDS),
    accent: z.enum(ACCENT_IDS),
    transparency: z.boolean(),
    locale: z.enum(['auto', 'en', 'zh-CN', 'zh-TW']),
    launchAtLogin: z.boolean(),
    savePath: folderPath,
    alwaysAskSavePath: z.boolean(),
    defaultFilter: filter,
    autoEnhance: z.boolean(),
    autoOcrPages: z.boolean(),
    pdf: z.object({
      paper: z.enum(['a4', 'letter', 'auto']),
      marginMm: z.number().min(0).max(50),
      quality: z.enum(['high', 'medium', 'small']),
      textLayer: z.boolean()
    }),
    watch: z.object({ enabled: z.boolean(), inputDir: folderPath, outputDir: folderPath, filter })
  })
  .partial()
  .strict()

let store: Store<StoreShape> | null = null
const events = new EventEmitter()

function defaultSettings(): Settings {
  const chinese = resolveLocale(app.getLocale())
  return {
    hotkeys: {
      regionOcr: 'CommandOrControl+Shift+1',
      imageOcr: 'CommandOrControl+Shift+2',
      quickCopy: 'CommandOrControl+Shift+3'
    },
    ocrLanguages: chinese === 'zh-TW' ? ['eng', 'chi_tra'] : chinese === 'zh-CN' ? ['eng', 'chi_sim'] : ['eng'],
    autoCopy: true,
    theme: 'system',
    accent: 'theme',
    transparency: true,
    locale: 'auto',
    launchAtLogin: false,
    savePath: '',
    alwaysAskSavePath: true,
    defaultFilter: 'magic',
    autoEnhance: true,
    autoOcrPages: true,
    pdf: { paper: 'a4', marginMm: 0, quality: 'medium', textLayer: true },
    watch: { enabled: false, inputDir: '', outputDir: '', filter: 'magic' }
  }
}

/** Must be called after app 'ready' (default OCR languages depend on the OS locale). */
export function initSettings(): void {
  const defaults = defaultSettings()
  store = new Store<StoreShape>({ name: 'settings', defaults: { settings: defaults, welcomed: false } })
  // Fill in keys added by newer versions.
  const current = store.get('settings')
  store.set('settings', {
    ...defaults,
    ...current,
    hotkeys: { ...defaults.hotkeys, ...current.hotkeys },
    pdf: { ...defaults.pdf, ...current.pdf },
    watch: { ...defaults.watch, ...current.watch }
  })
}

function requireStore(): Store<StoreShape> {
  if (!store) throw new Error('initSettings() has not been called')
  return store
}

export function getSettings(): Settings {
  return requireStore().get('settings')
}

/** Validates an untrusted patch (from a renderer), persists it and notifies listeners. */
export function updateSettings(patch: unknown): Settings {
  const parsed = settingsPatchSchema.parse(patch)
  const next: Settings = { ...getSettings(), ...parsed }
  requireStore().set('settings', next)
  events.emit('change', next)
  return next
}

export function onSettingsChange(listener: (settings: Settings) => void): void {
  events.on('change', listener)
}

export function uiLocale(): Locale {
  const { locale } = getSettings()
  return locale === 'auto' ? resolveLocale(app.getLocale()) : locale
}

export function takeFirstRun(): boolean {
  const s = requireStore()
  if (s.get('welcomed')) return false
  s.set('welcomed', true)
  return true
}
