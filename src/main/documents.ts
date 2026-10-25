import { readdir, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { IPC } from '@shared/api'
import { createTranslator } from '@shared/i18n'
import type { DocLayout, PageSource } from '@shared/types'
import { library, notifyLibraryChanged, removeDocumentFiles } from './library'
import { importFiles, importImageBytes, IMPORTABLE_IMAGE_TYPES, mimeForPath } from './pages'
import { scanPage, ScannerError } from './scanner'
import { uiLocale } from './settings'
import { createAppWindow } from './windows'

const editors = new Map<string, BrowserWindow>()

export function openEditor(docId: string): void {
  const existing = editors.get(docId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return
  }
  const win = createAppWindow('editor', { width: 1280, height: 860, minWidth: 900, minHeight: 600, show: false, autoHideMenuBar: true }, { doc: docId })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => editors.delete(docId))
  editors.set(docId, win)
}

function broadcastProgress(docId: string, done: number, total: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.importProgress, { docId, done, total })
  }
}

const naturalSort = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Ask the user for input files (or a scan). Returns null when cancelled. */
async function pickSource(source: PageSource, owner?: BrowserWindow): Promise<string[] | null> {
  const t = createTranslator(uiLocale())
  const open = (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
    owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)

  switch (source) {
    case 'images': {
      const result = await open({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: t('imageFilter'), extensions: Object.keys(IMPORTABLE_IMAGE_TYPES) }]
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
    }
    case 'folder': {
      const result = await open({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      const dir = result.filePaths[0]
      const files = (await readdir(dir)).filter((name) => mimeForPath(name)?.startsWith('image/')).sort(naturalSort)
      return files.map((name) => join(dir, name))
    }
    case 'pdf': {
      const result = await open({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
    }
    case 'scanner': {
      try {
        const file = await scanPage()
        return file ? [file] : null
      } catch (error) {
        const reason = error instanceof ScannerError ? error.reason : 'failed'
        const message = reason === 'unsupported' ? t('scannerUnsupported') : reason === 'noDevice' ? t('scannerNoDevice') : t('scannerFailed')
        await dialog.showMessageBox({ type: 'warning', message, detail: error instanceof Error && reason === 'failed' ? error.message : undefined })
        return null
      }
    }
  }
}

async function runImport(docId: string, paths: string[], source: PageSource): Promise<void> {
  try {
    await importFiles(docId, paths, { onProgress: (done, total) => broadcastProgress(docId, done, total) })
  } catch (error) {
    console.error('[import] failed', error)
    const t = createTranslator(uiLocale())
    await dialog.showMessageBox({ type: 'error', message: t('importFailed'), detail: error instanceof Error ? error.message : String(error) })
  } finally {
    if (source === 'scanner') await Promise.all(paths.map((p) => rm(p, { force: true })))
    broadcastProgress(docId, 1, 1)
    notifyLibraryChanged(docId)
  }
}

function defaultTitle(paths: string[], source: PageSource): string {
  if (paths.length === 1 && source !== 'scanner') return basename(paths[0], extname(paths[0]))
  const t = createTranslator(uiLocale())
  const stamp = new Date().toLocaleString(uiLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `${t('scanTitlePrefix')} ${stamp}`
}

/** Pick input, create a document, open it in the editor and import in the background. */
export async function createDocumentFromSource(source: PageSource, owner?: BrowserWindow, folderId: string | null = null): Promise<string | null> {
  const paths = await pickSource(source, owner)
  if (!paths || paths.length === 0) return null
  const doc = library().createDocument(defaultTitle(paths, source), folderId)
  notifyLibraryChanged(doc.id)
  openEditor(doc.id)
  void runImport(doc.id, paths, source)
  return doc.id
}

/** Pick input and append its pages to an existing document. Returns false when cancelled. */
export async function addPagesFromSource(docId: string, source: PageSource, owner?: BrowserWindow): Promise<boolean> {
  const paths = await pickSource(source, owner)
  if (!paths || paths.length === 0) return false
  void runImport(docId, paths, source)
  return true
}

/** "Open in scanner" from the OCR result window: the image becomes a new library document. */
export async function createDocumentFromImage(bytes: Uint8Array, mime: string, title: string): Promise<string> {
  const doc = library().createDocument(title)
  notifyLibraryChanged(doc.id)
  openEditor(doc.id)
  try {
    broadcastProgress(doc.id, 0, 1)
    await importImageBytes(doc.id, bytes, mime, { enhance: false, filter: 'original' })
  } finally {
    broadcastProgress(doc.id, 1, 1)
    notifyLibraryChanged(doc.id)
  }
  return doc.id
}

export function updateDocument(docId: string, patch: { title?: string; folderId?: string | null; layout?: DocLayout; tags?: string[] }): void {
  library().updateDocument(docId, patch)
  notifyLibraryChanged(docId)
}

export async function deleteDocument(docId: string): Promise<void> {
  editors.get(docId)?.close()
  library().deleteDocument(docId)
  await removeDocumentFiles(docId)
  notifyLibraryChanged(docId)
}
