import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import updaterPackage from 'electron-updater'
import { createTranslator } from '@shared/i18n'
import { uiLocale } from './settings'

const { autoUpdater } = updaterPackage

/**
 * electron-builder writes app-update.yml only when a `publish` feed is configured
 * (electron-builder.yml). Without one there is nothing to check, so no network calls.
 */
function updatesConfigured(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

/** Background update check on startup (installed builds only); downloads silently and offers a restart. */
export function initUpdater(): void {
  if (!updatesConfigured()) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    const t = createTranslator(uiLocale())
    void dialog
      .showMessageBox({
        type: 'info',
        message: t('updateReady', { version: info.version }),
        buttons: [t('updateRestart'), t('updateLater')],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (error) => console.warn('[update] check failed', error.message))
  void autoUpdater.checkForUpdates().catch(() => undefined)
}

/** "Check for updates…" from the tray. */
export async function checkForUpdatesInteractive(): Promise<void> {
  const t = createTranslator(uiLocale())
  if (!updatesConfigured()) {
    await dialog.showMessageBox({ type: 'info', message: t('updateDevBuild') })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const message =
      result && result.isUpdateAvailable
        ? t('updateDownloading', { version: result.updateInfo.version })
        : t('updateNone', { version: app.getVersion() })
    await dialog.showMessageBox({ type: 'info', message })
  } catch (error) {
    await dialog.showMessageBox({ type: 'warning', message: t('updateFailed'), detail: error instanceof Error ? error.message : String(error) })
  }
}
