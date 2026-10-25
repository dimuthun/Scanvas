import { writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { Notification, shell } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import { createTranslator } from '@shared/i18n'
import { safeFileName } from '@shared/pageMath'
import type { Settings, WatchSettings } from '@shared/types'
import { buildPdf } from './docExport'
import { uniquePath } from './exports'
import { library, notifyLibraryChanged } from './library'
import { importFiles, mimeForPath } from './pages'
import { getSettings, uiLocale } from './settings'

/**
 * Watch-folder automation: every image or PDF dropped into the input folder
 * is turned into a cleaned-up, searchable PDF in the output folder and added
 * to the library (folder "Watch folder").
 */

let watcher: FSWatcher | null = null
let activeKey = ''
let queue: Promise<void> = Promise.resolve()
/** Files we wrote ourselves (output folder may equal the input folder). */
const ownOutputs = new Set<string>()

const WATCH_FOLDER_NAME = 'Watch folder'

function isActive(w: WatchSettings): boolean {
  return w.enabled && !!w.inputDir && !!w.outputDir
}

export function applyWatchSettings(settings: Settings): void {
  const w = settings.watch
  const key = isActive(w) ? JSON.stringify([w.inputDir, w.outputDir]) : ''
  if (key === activeKey) return
  void watcher?.close()
  watcher = null
  activeKey = key
  if (!key) return

  // depth 0: only files directly in the input folder (a nested output folder is never watched).
  watcher = watch(w.inputDir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }
  })
  watcher.on('add', (path: string) => {
    const full = resolve(path)
    if (ownOutputs.delete(full) || !mimeForPath(full)) return
    queue = queue.then(() => processFile(full)).catch(() => undefined)
  })
  watcher.on('error', (error: unknown) => console.error('[watch] watcher error', error))
}

function watchFolderId(): string {
  const existing = library()
    .listFolders()
    .find((f) => f.name === WATCH_FOLDER_NAME)
  return (existing ?? library().createFolder(WATCH_FOLDER_NAME)).id
}

async function processFile(path: string): Promise<void> {
  const settings = getSettings()
  const t = createTranslator(uiLocale())
  const title = basename(path, extname(path))
  try {
    const doc = library().createDocument(title, watchFolderId())
    notifyLibraryChanged(doc.id)
    await importFiles(doc.id, [path], { enhance: true, filter: settings.watch.filter })
    const pdf = await buildPdf(doc.id, { ...settings.pdf, textLayer: true })
    const target = uniquePath(settings.watch.outputDir, safeFileName(title), 'pdf')
    ownOutputs.add(resolve(target))
    await writeFile(target, pdf)
    notifyLibraryChanged(doc.id)
    const notice = new Notification({ title: t('watchDone'), body: basename(target), silent: true })
    notice.on('click', () => shell.showItemInFolder(target))
    notice.show()
  } catch (error) {
    console.error('[watch] processing failed', path, error)
    new Notification({ title: t('watchFailed'), body: basename(path) }).show()
  }
}

export async function stopWatching(): Promise<void> {
  activeKey = ''
  await watcher?.close()
  watcher = null
}
