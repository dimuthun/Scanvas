import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { createTranslator, type MessageKey } from '@shared/i18n'
import { uiLocale } from './settings'
import { createAppWindow, resourcePath, type Page } from './windows'

const singletons = new Map<Page, BrowserWindow>()

/** Show (or create) the single instance of a top-level window. */
function showSingleton(page: Page, titleKey: MessageKey, options: BrowserWindowConstructorOptions): BrowserWindow {
  const existing = singletons.get(page)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  const win = createAppWindow(page, {
    show: false,
    title: createTranslator(uiLocale())(titleKey),
    autoHideMenuBar: true,
    icon: resourcePath('icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    ...options
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => singletons.delete(page))
  singletons.set(page, win)
  return win
}

export function showLibraryWindow(): void {
  showSingleton('library', 'libraryTitle', { width: 1180, height: 780, minWidth: 820, minHeight: 520 })
}

export function showPdfToolsWindow(): void {
  showSingleton('pdftools', 'pdfToolsTitle', { width: 1100, height: 760, minWidth: 760, minHeight: 480 })
}

export function showSettingsWindow(): void {
  showSingleton('settings', 'settingsTitle', { width: 620, height: 760, minWidth: 520, minHeight: 480 })
}
