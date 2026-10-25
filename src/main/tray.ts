import { app, Menu, nativeImage, nativeTheme, Tray } from 'electron'
import { createTranslator } from '@shared/i18n'
import { actions } from './actions'
import { getSettings, uiLocale } from './settings'
import { checkForUpdatesInteractive } from './updater'
import { resourcePath } from './windows'

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  // Light glyph on dark taskbars/menu bars, dark glyph otherwise. macOS uses a template image.
  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(resourcePath('icons', 'tray.png'))
    image.setTemplateImage(true)
    return image
  }
  const file = nativeTheme.shouldUseDarkColors ? 'tray-dark.png' : 'tray.png'
  return nativeImage.createFromPath(resourcePath('icons', file))
}

const safe =
  (fn: () => Promise<void> | void) =>
  (): void => {
    Promise.resolve(fn()).catch((error: unknown) => console.error('[tray] action failed', error))
  }

function buildMenu(): Menu {
  const t = createTranslator(uiLocale())
  const { hotkeys, watch } = getSettings()
  return Menu.buildFromTemplate([
    // Accelerators here are display-only hints; the real bindings are global shortcuts.
    { label: t('menuRegionOcr'), accelerator: hotkeys.regionOcr || undefined, registerAccelerator: false, click: safe(actions.regionOcr) },
    { label: t('menuImageOcr'), accelerator: hotkeys.imageOcr || undefined, registerAccelerator: false, click: safe(actions.imageOcr) },
    { label: t('menuQuickCopy'), accelerator: hotkeys.quickCopy || undefined, registerAccelerator: false, click: safe(actions.quickCopy) },
    { type: 'separator' },
    { label: t('menuScanImages'), click: safe(() => actions.scan('images')) },
    { label: t('menuScanPdf'), click: safe(() => actions.scan('pdf')) },
    { label: t('menuScanScanner'), click: safe(() => actions.scan('scanner')), visible: process.platform === 'win32' },
    { label: t('menuLibrary'), click: safe(actions.library) },
    { label: t('menuPdfTools'), click: safe(() => actions.openWindow('pdftools')) },
    { type: 'separator' },
    { label: t('menuWatchFolder'), type: 'checkbox', checked: watch.enabled, click: safe(actions.toggleWatchFolder) },
    { label: t('menuSettings'), click: safe(actions.settings) },
    { label: t('menuCheckUpdates'), click: safe(checkForUpdatesInteractive) },
    { type: 'separator' },
    { label: t('menuQuit'), click: () => app.quit() }
  ])
}

export function createTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip(createTranslator(uiLocale())('trayTooltip'))
  tray.setContextMenu(buildMenu())
  // Left-click opens the library (the main window) on Windows/Linux.
  tray.on('click', () => {
    if (process.platform !== 'darwin') actions.library()
  })
  nativeTheme.on('updated', () => tray?.setImage(trayIcon()))
}

/** Rebuild labels/accelerators/checkmarks after a settings change. */
export function refreshTray(): void {
  if (!tray) return
  tray.setToolTip(createTranslator(uiLocale())('trayTooltip'))
  tray.setContextMenu(buildMenu())
}
