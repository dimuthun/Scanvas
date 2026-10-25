import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Product name before the rename to Scanvas; its data is moved over once. */
const LEGACY_PRODUCT_NAME = 'SnapText'

/** What Scanvas itself stores in the profile (Chromium caches are not worth moving). */
const DATA_ITEMS = ['library.db', 'library.db-wal', 'library.db-shm', 'library', 'settings.json']

/**
 * Electron derives the profile folder from the product name and creates it
 * before any app code runs, so after the rename the new folder always exists.
 * Move our own data (library database, page images, settings) from the old
 * profile when the new one has none yet. Must run before settings/library are
 * opened. Never deletes anything; on failure the old data stays where it was.
 */
export function migrateUserData(): void {
  const current = app.getPath('userData')
  const legacy = join(app.getPath('appData'), LEGACY_PRODUCT_NAME)
  const hasData = (dir: string): boolean => existsSync(join(dir, 'library.db')) || existsSync(join(dir, 'settings.json'))
  if (!existsSync(legacy) || !hasData(legacy) || hasData(current)) return

  mkdirSync(current, { recursive: true })
  for (const item of DATA_ITEMS) {
    const from = join(legacy, item)
    if (!existsSync(from)) continue
    try {
      renameSync(from, join(current, item))
    } catch (error) {
      console.warn(`[migrate] could not move ${from}`, error)
    }
  }
  console.info(`[migrate] moved library and settings from ${legacy} to ${current}`)
}
