const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Convert a keydown event into an Electron accelerator string, or null if it is not a usable shortcut. */
export function acceleratorFromEvent(event: KeyLike): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  let key: string
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3)
  else if (/^Digit\d$/.test(event.code)) key = event.code.slice(5)
  else if (/^F\d{1,2}$/.test(event.key)) key = event.key
  else if (event.key === ' ') key = 'Space'
  else if (event.key.length === 1) key = event.key.toUpperCase()
  else key = event.key.replace(/^Arrow/, '')
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  // Require a modifier (except function keys) so a global shortcut never swallows normal typing.
  if (parts.length === 0 && !/^F\d{1,2}$/.test(key)) return null
  return [...parts, key].join('+')
}

export function formatAccelerator(accelerator: string, platform: string): string {
  return accelerator.replace('CommandOrControl', platform === 'darwin' ? '⌘' : 'Ctrl')
}
