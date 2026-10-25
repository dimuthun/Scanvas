import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/api'
import { FILTERS, OCR_LANGUAGES, type AppInfo, type ExportFormat } from '@shared/types'
import { actions } from './actions'
import { cancelCapture, submitCapture } from './capture'
import { exportDocx, exportImages, exportPdf, exportText } from './docExport'
import {
  addPagesFromSource,
  createDocumentFromImage,
  createDocumentFromSource,
  deleteDocument,
  openEditor,
  updateDocument
} from './documents'
import {
  cancelSavePrompt,
  chooseSaveFolder,
  clearFinishedJobs,
  confirmSavePrompt,
  getJobs,
  getSavePrompt,
  openJobFile,
  openJobFolder,
  requestExport
} from './exports'
import { decodeImageDataUrl } from './images'
import { library, notifyLibraryChanged } from './library'
import {
  autoDetectCorners,
  autoRotate,
  deletePage,
  movePage,
  ocrPage,
  rotatePage,
  splitSpread,
  straighten,
  updateParams
} from './pages'
import { closePdfFile, openPdfFiles, saveComposed, saveSplit } from './pdftools'
import { getPrintJob, printDocument, printReady } from './print'
import { getResultState, rerunResult, resultImage, showResult } from './result'
import { isServiceWindow, resolveServiceCall } from './serviceWindow'
import { getSettings, uiLocale, updateSettings } from './settings'
import { getShortcutStatus } from './shortcuts'
import { checkForUpdatesInteractive } from './updater'
import { isTrustedSender } from './windows'

// ---------------------------------------------------------------- argument schemas

const text = z.string().max(10_000_000)
const id = z.string().regex(/^[0-9a-f-]{36}$/i)
const name = z.string().trim().min(1).max(200)
const languages = z.array(z.enum(OCR_LANGUAGES)).min(1)
const externalUrl = z.url({ protocol: /^https?$/ })
const source = z.enum(['images', 'folder', 'pdf', 'scanner'])
const paper = z.enum(['a4', 'letter', 'auto'])
const margin = z.number().min(0).max(50)
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
const unitRect = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) })

const paramsPatch = z
  .object({
    corners: z.tuple([point, point, point, point]).nullable(),
    rotation,
    flipH: z.boolean(),
    flipV: z.boolean(),
    crop: unitRect.nullable(),
    angle: z.number().min(-45).max(45),
    filter: z.enum(FILTERS),
    removeShadows: z.boolean(),
    brightness: z.number().min(-100).max(100),
    contrast: z.number().min(-100).max(100)
  })
  .partial()
  .strict()

const documentPatch = z
  .object({
    title: name,
    folderId: id.nullable(),
    layout: z.enum(['pages', 'idcard']),
    tags: z.array(z.string().trim().max(60)).max(50)
  })
  .partial()
  .strict()

const libraryQuery = z
  .object({ folderId: id.nullable().optional(), tag: z.string().max(60).optional(), text: z.string().max(500).optional() })
  .strict()

const pdfOptions = z.object({ paper, marginMm: margin, quality: z.enum(['high', 'medium', 'small']), textLayer: z.boolean() }).strict()
const exportFormat = z.enum(['pdf', 'docx', 'images', 'txt'])
const toolPages = z.array(z.object({ fileId: id, pageIndex: z.number().int().min(0), rotation }).strict()).min(1).max(10_000)
const splitMode = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('every'), size: z.number().int().min(1) }),
  z.object({ kind: z.literal('ranges'), ranges: z.string().max(2000) })
])
const appWindow = z.enum(['library', 'settings', 'pdftools', 'downloads'])

// ---------------------------------------------------------------- registration

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isTrustedSender(event)) throw new Error(`Rejected IPC from untrusted sender on ${channel}`)
    return handler(event, ...args)
  })
}

const ownerOf = (event: IpcMainInvokeEvent): BrowserWindow | undefined => BrowserWindow.fromWebContents(event.sender) ?? undefined

const EXTENSIONS: Record<ExportFormat, string> = { pdf: 'pdf', docx: 'docx', images: 'jpg', txt: 'txt' }

export function registerIpc(): void {
  // app
  handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion(), platform: process.platform, locale: uiLocale() }))
  handle(IPC.openExternal, (_e, url) => shell.openExternal(externalUrl.parse(url)))
  handle(IPC.openWindow, (_e, which) => actions.openWindow(appWindow.parse(which)))
  handle(IPC.checkUpdates, () => checkForUpdatesInteractive())
  handle(IPC.chooseFolder, async (event, current) => {
    const owner = ownerOf(event)
    const options: Electron.OpenDialogOptions = {
      defaultPath: typeof current === 'string' && current ? current : undefined,
      properties: ['openDirectory', 'createDirectory']
    }
    const { canceled, filePaths } = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    return canceled ? null : filePaths[0]
  })

  // capture & OCR result
  handle(IPC.captureSubmit, (_e, dataUrl, mode) => submitCapture(dataUrl, z.enum(['result', 'quickCopy']).optional().parse(mode ?? undefined)))
  handle(IPC.captureCancel, () => cancelCapture())
  handle(IPC.captureStart, () => actions.regionOcr())
  handle(IPC.imageOpen, () => actions.imageOcr())
  handle(IPC.imageSubmit, (_e, dataUrl) => showResult(decodeImageDataUrl(dataUrl)))
  handle(IPC.resultGet, () => getResultState())
  handle(IPC.resultRerun, (_e, langs) => rerunResult(languages.parse(langs)))
  handle(IPC.resultSaveText, async (event, value) => {
    const content = text.parse(value)
    const owner = ownerOf(event)
    const options = { defaultPath: 'ocr-text.txt', filters: [{ name: 'Text', extensions: ['txt'] }] }
    const { canceled, filePath } = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return false
    await writeFile(filePath, content, 'utf8')
    return true
  })
  handle(IPC.resultToLibrary, async () => {
    const image = resultImage()
    if (image) await createDocumentFromImage(image.bytes, image.mime, new Date().toLocaleString(uiLocale()))
  })
  handle(IPC.clipboardWrite, (_e, value) => clipboard.writeText(text.parse(value)))

  // settings
  handle(IPC.settingsGet, () => getSettings())
  handle(IPC.settingsUpdate, (_e, patch) => updateSettings(patch))
  handle(IPC.shortcutStatus, () => getShortcutStatus())

  // library
  handle(IPC.libraryList, (_e, query) => library().listDocuments(libraryQuery.parse(query ?? {})))
  handle(IPC.libraryFolders, () => library().listFolders())
  handle(IPC.libraryTags, () => library().listTags())
  handle(IPC.folderCreate, (_e, folderName) => {
    const folder = library().createFolder(name.parse(folderName))
    notifyLibraryChanged()
    return folder
  })
  handle(IPC.folderRename, (_e, folderId, folderName) => {
    library().renameFolder(id.parse(folderId), name.parse(folderName))
    notifyLibraryChanged()
  })
  handle(IPC.folderDelete, (_e, folderId) => {
    library().deleteFolder(id.parse(folderId))
    notifyLibraryChanged()
  })

  // documents
  handle(IPC.docCreate, (event, from, folderId) => createDocumentFromSource(source.parse(from), ownerOf(event), id.nullable().parse(folderId ?? null)))
  handle(IPC.docGet, (_e, docId) => {
    const document = library().getDocument(id.parse(docId))
    return document ? { document, pages: library().listPages(document.id) } : null
  })
  handle(IPC.docUpdate, (_e, docId, patch) => updateDocument(id.parse(docId), documentPatch.parse(patch)))
  handle(IPC.docDelete, (_e, docId) => deleteDocument(id.parse(docId)))
  handle(IPC.docOpen, (_e, docId) => openEditor(id.parse(docId)))
  handle(IPC.docAddPages, (event, docId, from) => addPagesFromSource(id.parse(docId), source.parse(from), ownerOf(event)))
  handle(IPC.docExport, async (_e, docId, format, options) => {
    const documentId = id.parse(docId)
    const kind = exportFormat.parse(format)
    const document = library().getDocument(documentId)
    if (!document) throw new Error('Document not found')
    const pdf = options ? pdfOptions.parse(options) : getSettings().pdf
    await requestExport(document.title, EXTENSIONS[kind], async (filePath, progress) => {
      if (kind === 'pdf') await exportPdf(documentId, filePath, pdf, progress)
      else if (kind === 'docx') await exportDocx(documentId, filePath, progress)
      else if (kind === 'images') await exportImages(documentId, filePath, progress)
      else await exportText(documentId, filePath, progress)
    })
  })
  handle(IPC.docPrint, (_e, docId, paperSize, marginMm) => printDocument(id.parse(docId), paper.parse(paperSize), margin.parse(marginMm)))

  // pages (fire-and-forget renders report back through library:changed)
  handle(IPC.pageParams, async (_e, pageId, patch) => void (await updateParams(id.parse(pageId), paramsPatch.parse(patch))))
  handle(IPC.pageDetect, async (_e, pageId) => void (await autoDetectCorners(id.parse(pageId))))
  handle(IPC.pageStraighten, async (_e, pageId) => void (await straighten(id.parse(pageId))))
  handle(IPC.pageAutoRotate, async (_e, pageId) => void (await autoRotate(id.parse(pageId))))
  handle(IPC.pageRotate, async (_e, pageId, delta) => void (await rotatePage(id.parse(pageId), z.union([z.literal(90), z.literal(-90)]).parse(delta))))
  handle(IPC.pageSplit, async (_e, pageId) => void (await splitSpread(id.parse(pageId))))
  handle(IPC.pageDelete, (_e, pageId) => deletePage(id.parse(pageId)))
  handle(IPC.pageMove, (_e, pageId, toIndex) => movePage(id.parse(pageId), z.number().int().min(0).parse(toIndex)))
  handle(IPC.pageOcr, async (_e, pageId) => void (await ocrPage(id.parse(pageId))))

  // export manager
  handle(IPC.jobsGet, () => getJobs())
  handle(IPC.jobOpenFolder, (_e, jobId) => openJobFolder(id.parse(jobId)))
  handle(IPC.jobOpenFile, (_e, jobId) => openJobFile(id.parse(jobId)))
  handle(IPC.jobsClear, () => clearFinishedJobs())
  handle(IPC.savePromptGet, () => getSavePrompt())
  handle(IPC.savePromptChoose, () => chooseSaveFolder())
  handle(IPC.savePromptConfirm, (_e, folder, fileName) => confirmSavePrompt({ folder: z.string().min(1).max(1024).parse(folder), fileName: name.parse(fileName) }))
  handle(IPC.savePromptCancel, () => cancelSavePrompt())

  // printing
  handle(IPC.printJobGet, (_e, jobId) => getPrintJob(id.parse(jobId)))
  handle(IPC.printReady, (_e, jobId) => printReady(id.parse(jobId)))

  // PDF tools
  handle(IPC.pdfToolsOpen, (event) => openPdfFiles(ownerOf(event)))
  handle(IPC.pdfToolsClose, (_e, fileId) => closePdfFile(id.parse(fileId)))
  handle(IPC.pdfToolsSave, async (_e, pages, fileName) => void (await saveComposed(toolPages.parse(pages), name.parse(fileName))))
  handle(IPC.pdfToolsSplit, async (_e, pages, mode, fileName) => void (await saveSplit(toolPages.parse(pages), splitMode.parse(mode), name.parse(fileName))))

  // hidden service renderer
  handle(IPC.serviceRespond, (event, requestId, ok, payload) => {
    if (!isServiceWindow(event.sender)) throw new Error('Only the service window may respond')
    resolveServiceCall(z.number().int().parse(requestId), z.boolean().parse(ok), payload)
  })
}
