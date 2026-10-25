import { dialog } from 'electron'
import type { AppWindow } from '@shared/api'
import { createTranslator } from '@shared/i18n'
import type { PageSource } from '@shared/types'
import { showLibraryWindow, showPdfToolsWindow, showSettingsWindow } from './appWindows'
import { startCapture } from './capture'
import { createDocumentFromSource } from './documents'
import { showDownloads } from './exports'
import { IMAGE_EXTENSIONS, readImageFile } from './images'
import { ensureScreenPermission } from './permissions'
import { showResult } from './result'
import { getSettings, uiLocale, updateSettings } from './settings'

/** User-facing commands shared by the tray menu, global shortcuts and renderer buttons. */
export const actions = {
  async regionOcr(): Promise<void> {
    if (await ensureScreenPermission()) await startCapture('result')
  },
  async quickCopy(): Promise<void> {
    if (await ensureScreenPermission()) await startCapture('quickCopy')
  },
  async imageOcr(): Promise<void> {
    const t = createTranslator(uiLocale())
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: t('imageFilter'), extensions: [...IMAGE_EXTENSIONS] }]
    })
    if (canceled || filePaths.length === 0) return
    await showResult(await readImageFile(filePaths[0]))
  },
  async scan(source: PageSource): Promise<void> {
    await createDocumentFromSource(source)
  },
  settings(): void {
    showSettingsWindow()
  },
  library(): void {
    showLibraryWindow()
  },
  openWindow(window: AppWindow): void {
    if (window === 'library') showLibraryWindow()
    else if (window === 'settings') showSettingsWindow()
    else if (window === 'pdftools') showPdfToolsWindow()
    else showDownloads()
  },
  toggleWatchFolder(): void {
    const { watch } = getSettings()
    if (!watch.enabled && (!watch.inputDir || !watch.outputDir)) {
      // Folders must be chosen first.
      showSettingsWindow()
      return
    }
    updateSettings({ watch: { ...watch, enabled: !watch.enabled } })
  }
}
