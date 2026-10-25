import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { app, BrowserWindow, globalShortcut, nativeTheme, Notification, session } from 'electron'
import { IPC, type AppWindow } from '@shared/api'
import { createTranslator } from '@shared/i18n'
import { PRESETS } from '@shared/themes'
import type { Settings } from '@shared/types'
import { actions } from './actions'
import { createDocumentFromPaths, openEditor } from './documents'
import { shutdownImaging } from './imaging/client'
import { registerIpc } from './ipc'
import { readImageFile } from './images'
import { closeLibrary, initLibrary, library } from './library'
import { migrateUserData } from './migrate'
import { shutdownOcr } from './ocr'
import { mimeForPath } from './pages'
import { registerAppProtocol, registerSchemePrivileges } from './protocol'
import { showResult } from './result'
import { getSettings, initSettings, onSettingsChange, takeFirstRun, uiLocale } from './settings'
import { applyShortcuts } from './shortcuts'
import { createTray, refreshTray } from './tray'
import { initUpdater } from './updater'
import { applyWatchSettings, stopWatching } from './watcher'
import { refreshWindowChrome } from './windows'

// Portable / testing mode: keep the library and settings in a custom folder.
const profileOverride = process.env['SCANVAS_USER_DATA_DIR']
if (profileOverride && isAbsolute(profileOverride)) app.setPath('userData', profileOverride)
else migrateUserData()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  registerSchemePrivileges()

  /**
   * Command-line entry points (shortcuts, jump lists, "Open with", scripting):
   * `--open=library|settings|pdftools|downloads` opens that window, `--doc=<id>` opens a document,
   * `--capture` starts a screenshot-OCR selection, `--ocr=<image>` recognizes an image file,
   * and image/PDF paths become a new scanned document.
   */
  const OPENABLE: readonly AppWindow[] = ['library', 'settings', 'pdftools', 'downloads']
  function openFromArgs(argv: string[]): boolean {
    if (argv.includes('--capture')) {
      void actions.regionOcr()
      return true
    }
    const value = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
    const ocrFile = value('ocr')
    if (ocrFile && isAbsolute(ocrFile) && existsSync(ocrFile)) {
      void readImageFile(ocrFile)
        .then((image) => showResult(image))
        .catch((error: unknown) => console.error('[args] --ocr failed', error))
      return true
    }
    const files = argv.filter((arg) => !arg.startsWith('-') && isAbsolute(arg) && mimeForPath(arg) && existsSync(arg))
    if (files.length > 0) {
      void createDocumentFromPaths(files).catch((error: unknown) => console.error('[args] import failed', error))
      return true
    }
    const docId = value('doc')
    if (docId && /^[0-9a-f-]{36}$/i.test(docId) && library().getDocument(docId)) {
      openEditor(docId)
      return true
    }
    const target = value('open')
    if (!target || !OPENABLE.includes(target as AppWindow)) return false
    actions.openWindow(target as AppWindow)
    return true
  }

  app.on('second-instance', (_event, argv) => {
    if (!openFromArgs(argv)) actions.library()
  })
  app.setAppUserModelId('com.scanvas.app')

  // Diagnostics: report crashed renderers/helpers with the reason Chromium gives.
  app.on('render-process-gone', (_event, contents, details) => {
    console.error(`[crash] renderer ${contents.getURL()} gone: ${details.reason} (exit ${details.exitCode})`)
  })
  app.on('child-process-gone', (_event, details) => {
    console.error(`[crash] ${details.type} process gone: ${details.reason} (exit ${details.exitCode})`)
  })

  // Defense in depth: renderers never open new windows, navigate away, or get device permissions.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => event.preventDefault())
  })

  function applyGeneralSettings(settings: Settings): void {
    // Native dialogs, menus and scrollbars follow the preset's light/dark base.
    nativeTheme.themeSource = settings.theme === 'system' ? 'system' : PRESETS[settings.theme].base
    refreshWindowChrome()
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] })
    applyWatchSettings(settings)
  }

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    initSettings()
    initLibrary()
    registerAppProtocol()
    registerIpc()
    const settings = getSettings()
    applyGeneralSettings(settings)
    // "System" theme: OS light/dark switches recolor the window chrome live.
    nativeTheme.on('updated', refreshWindowChrome)
    createTray()
    applyShortcuts(settings)
    initUpdater()

    onSettingsChange((next) => {
      applyGeneralSettings(next)
      applyShortcuts(next)
      refreshTray()
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.settingsChanged, next)
    })

    const firstRun = takeFirstRun()
    if (firstRun) {
      const t = createTranslator(uiLocale())
      new Notification({ title: t('welcomeTitle'), body: t('welcomeBody', { hotkey: settings.hotkeys.regionOcr }) }).show()
    }
    // Started at login: stay in the tray. Started by the user: show the library.
    if (!openFromArgs(process.argv) && !process.argv.includes('--hidden')) actions.library()
  })

  // Tray app: keep running when the last window closes.
  app.on('window-all-closed', () => undefined)

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    void stopWatching()
    void shutdownOcr()
    void shutdownImaging()
    closeLibrary()
  })
}
