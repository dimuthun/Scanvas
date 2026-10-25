import { dialog, shell, systemPreferences } from 'electron'
import { createTranslator } from '@shared/i18n'
import { uiLocale } from './settings'

const SCREEN_RECORDING_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

/** macOS requires the Screen Recording permission; other platforms always allow capture. */
export async function ensureScreenPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return true
  const t = createTranslator(uiLocale())
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: t('permissionTitle'),
    detail: t('permissionBody'),
    buttons: [t('permissionOpen'), t('overlayCancel')],
    defaultId: 0,
    cancelId: 1
  })
  if (response === 0) await shell.openExternal(SCREEN_RECORDING_PANE)
  return false
}
