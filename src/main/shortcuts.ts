import { globalShortcut, Notification } from 'electron'
import { createTranslator } from '@shared/i18n'
import { HOTKEY_ACTIONS, type HotkeyAction, type Settings, type ShortcutStatus } from '@shared/types'
import { actions } from './actions'
import { uiLocale } from './settings'

let status: ShortcutStatus = { regionOcr: false, imageOcr: false, quickCopy: false }
let registered: Record<HotkeyAction, string> | null = null

const run = (action: HotkeyAction) => (): void => {
  actions[action]().catch((error: unknown) => console.error(`[shortcut] ${action} failed`, error))
}

/** (Re)register global shortcuts from settings; warns once per newly-conflicting shortcut. */
export function applyShortcuts(settings: Settings): void {
  const previous = registered
  globalShortcut.unregisterAll()
  const t = createTranslator(uiLocale())
  const next: ShortcutStatus = { regionOcr: false, imageOcr: false, quickCopy: false }
  for (const action of HOTKEY_ACTIONS) {
    const accelerator = settings.hotkeys[action]
    if (!accelerator) continue
    try {
      next[action] = globalShortcut.register(accelerator, run(action))
    } catch {
      next[action] = false
    }
    if (!next[action] && previous?.[action] !== accelerator) {
      new Notification({ title: t('appName'), body: t('hotkeyTaken', { hotkey: accelerator }) }).show()
    }
  }
  status = next
  registered = { ...settings.hotkeys }
}

export function getShortcutStatus(): ShortcutStatus {
  return status
}
