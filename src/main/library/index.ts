import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { IPC } from '@shared/api'
import type { PageAsset } from '@shared/pageMath'
import type { PageRecord } from '@shared/types'
import { LibraryRepo } from './repo'

let repo: LibraryRepo | null = null

export function libraryRoot(): string {
  return join(app.getPath('userData'), 'library')
}

export function initLibrary(): LibraryRepo {
  repo = new LibraryRepo(join(app.getPath('userData'), 'library.db'))
  return repo
}

export function library(): LibraryRepo {
  if (!repo) throw new Error('initLibrary() has not been called')
  return repo
}

export function closeLibrary(): void {
  repo?.close()
  repo = null
}

export function pageDir(docId: string, pageId: string): string {
  return join(libraryRoot(), docId, pageId)
}

export function pageFile(page: Pick<PageRecord, 'docId' | 'id' | 'originalExt' | 'processedExt'>, asset: PageAsset | 'text'): string {
  const dir = pageDir(page.docId, page.id)
  switch (asset) {
    case 'original':
      return join(dir, `original.${page.originalExt}`)
    case 'processed':
      return join(dir, `processed.${page.processedExt}`)
    case 'thumb':
      return join(dir, 'thumb.jpg')
    case 'text':
      return join(dir, 'text.pdf')
  }
}

export async function ensurePageDir(docId: string, pageId: string): Promise<string> {
  const dir = pageDir(docId, pageId)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function removeDocumentFiles(docId: string): Promise<void> {
  await rm(join(libraryRoot(), docId), { recursive: true, force: true })
}

export async function removePageFiles(docId: string, pageId: string): Promise<void> {
  await rm(pageDir(docId, pageId), { recursive: true, force: true })
}

/** Tell every window that library data changed (documents list, a document's pages, …). */
export function notifyLibraryChanged(docId: string | null = null): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.libraryChanged, docId)
  }
}
