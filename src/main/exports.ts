import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { app, BrowserWindow, dialog, Notification, shell } from 'electron'
import { IPC } from '@shared/api'
import { createTranslator } from '@shared/i18n'
import { safeFileName } from '@shared/pageMath'
import type { ExportJob, SavePrompt } from '@shared/types'
import { getSettings, uiLocale, updateSettings } from './settings'
import { createAppWindow } from './windows'

/**
 * Export ("download") manager, modeled on CamScanner desktop's save-path
 * dialog + progress window: asks where to save (or uses the remembered
 * folder), runs the export as a tracked job and offers "Open folder".
 */

const jobs: ExportJob[] = []
let downloadsWin: BrowserWindow | null = null
let promptWin: BrowserWindow | null = null
let activePrompt: { prompt: SavePrompt; resolve(target: { folder: string; fileName: string } | null): void } | null = null

export function defaultSaveFolder(): string {
  const configured = getSettings().savePath
  return configured && existsSync(configured) ? configured : app.getPath('downloads')
}

/** `dir/name.ext`, or `dir/name (2).ext` etc. if that already exists. */
export function uniquePath(dir: string, name: string, ext: string): string {
  let candidate = join(dir, `${name}.${ext}`)
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${name} (${n}).${ext}`)
  return candidate
}

function broadcastJobs(): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC.jobsChanged, jobs)
}

export function getJobs(): ExportJob[] {
  return jobs
}

export function clearFinishedJobs(): void {
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].state === 'done' || jobs[i].state === 'failed') jobs.splice(i, 1)
  broadcastJobs()
}

export function findJob(id: string): ExportJob | undefined {
  return jobs.find((j) => j.id === id)
}

export function showDownloads(): void {
  if (downloadsWin && !downloadsWin.isDestroyed()) {
    downloadsWin.showInactive()
    return
  }
  const t = createTranslator(uiLocale())
  downloadsWin = createAppWindow('downloads', {
    width: 560,
    height: 360,
    minWidth: 420,
    minHeight: 200,
    show: false,
    title: t('downloadsTitle'),
    autoHideMenuBar: true
  })
  downloadsWin.once('ready-to-show', () => downloadsWin?.show())
  downloadsWin.on('closed', () => (downloadsWin = null))
}

// ---------------------------------------------------------------- save-path prompt

function promptForTarget(prompt: SavePrompt): Promise<{ folder: string; fileName: string } | null> {
  activePrompt?.resolve(null)
  return new Promise((resolve) => {
    activePrompt = { prompt, resolve }
    if (promptWin && !promptWin.isDestroyed()) promptWin.close()
    const t = createTranslator(uiLocale())
    promptWin = createAppWindow('savepath', {
      width: 540,
      height: 330,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title: t('savePathTitle'),
      autoHideMenuBar: true
    })
    promptWin.once('ready-to-show', () => promptWin?.show())
    promptWin.on('closed', () => {
      promptWin = null
      settlePrompt(null)
    })
  })
}

function settlePrompt(target: { folder: string; fileName: string } | null): void {
  const current = activePrompt
  activePrompt = null
  current?.resolve(target)
}

export function getSavePrompt(): SavePrompt | null {
  return activePrompt?.prompt ?? null
}

export async function chooseSaveFolder(): Promise<string | null> {
  const t = createTranslator(uiLocale())
  const options: Electron.OpenDialogOptions = {
    buttonLabel: t('savePathChoose'),
    defaultPath: activePrompt?.prompt.folder ?? defaultSaveFolder(),
    properties: ['openDirectory', 'createDirectory']
  }
  const owner = promptWin && !promptWin.isDestroyed() ? promptWin : null
  const { canceled, filePaths } = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
  return canceled ? null : filePaths[0]
}

export function confirmSavePrompt(target: { folder: string; fileName: string }): void {
  // Like the original app, the folder used last becomes the default.
  if (target.folder !== getSettings().savePath) updateSettings({ savePath: target.folder })
  settlePrompt({ folder: target.folder, fileName: safeFileName(target.fileName) })
  promptWin?.close()
}

export function cancelSavePrompt(): void {
  settlePrompt(null)
  promptWin?.close()
}

// ---------------------------------------------------------------- jobs

export type ExportRunner = (filePath: string, progress: (fraction: number) => void) => Promise<void>

/** Ask for a destination (if configured), then run and track an export. Returns the file path or null if cancelled. */
export async function requestExport(suggestedName: string, extension: string, run: ExportRunner): Promise<string | null> {
  const prompt: SavePrompt = { folder: defaultSaveFolder(), fileName: safeFileName(suggestedName), extension }
  const target = getSettings().alwaysAskSavePath ? await promptForTarget(prompt) : prompt
  if (!target) return null
  const filePath = uniquePath(target.folder, target.fileName, extension)
  await runJob(filePath, run)
  return filePath
}

export async function runJob(filePath: string, run: ExportRunner): Promise<void> {
  const job: ExportJob = {
    id: randomUUID(),
    fileName: basename(filePath),
    filePath,
    state: 'ready',
    progress: 0,
    bytes: 0,
    startedAt: Date.now()
  }
  jobs.unshift(job)
  showDownloads()
  broadcastJobs()

  let lastBroadcast = 0
  const t = createTranslator(uiLocale())
  try {
    job.state = 'progress'
    await run(filePath, (fraction) => {
      job.progress = Math.max(0, Math.min(1, fraction))
      const now = Date.now()
      if (now - lastBroadcast > 100) {
        lastBroadcast = now
        broadcastJobs()
      }
    })
    job.state = 'done'
    job.progress = 1
    job.bytes = existsSync(filePath) ? (await stat(filePath)).size : 0
    const notice = new Notification({ title: t('exportDone'), body: job.fileName, silent: true })
    notice.on('click', () => shell.showItemInFolder(filePath))
    notice.show()
  } catch (error) {
    console.error('[export] failed', error)
    job.state = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
  }
  broadcastJobs()
}

export function openJobFolder(id: string): void {
  const job = findJob(id)
  if (!job) return
  if (existsSync(job.filePath)) shell.showItemInFolder(job.filePath)
  else void shell.openPath(dirname(job.filePath))
}

export function openJobFile(id: string): void {
  const job = findJob(id)
  if (job?.state === 'done' && extname(job.filePath) && existsSync(job.filePath)) void shell.openPath(job.filePath)
}
