import type {
  AppInfo,
  CaptureInit,
  DocLayout,
  DocumentDetail,
  ExportFormat,
  ExportJob,
  FolderRecord,
  LibraryQuery,
  OcrLanguage,
  PageParams,
  PageSource,
  PaperSize,
  PdfExportOptions,
  PdfToolFile,
  PdfToolPage,
  ResultState,
  SavePrompt,
  SearchHit,
  Settings,
  ShortcutStatus,
  SplitMode
} from './types'
import type { Rect, Size } from './types'

/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
  appInfo: 'app:info',
  openExternal: 'app:open-external',
  openWindow: 'app:open-window',
  checkUpdates: 'app:check-updates',
  chooseFolder: 'app:choose-folder',

  captureInit: 'capture:init',
  captureSubmit: 'capture:submit',
  captureCancel: 'capture:cancel',
  captureStart: 'capture:start',

  imageOpen: 'image:open',
  imageSubmit: 'image:submit',

  resultGet: 'result:get',
  resultUpdate: 'result:update',
  resultRerun: 'result:rerun',
  resultSaveText: 'result:save-text',
  resultToLibrary: 'result:to-library',
  clipboardWrite: 'clipboard:write',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  shortcutStatus: 'settings:shortcut-status',

  libraryList: 'library:list',
  libraryFolders: 'library:folders',
  libraryTags: 'library:tags',
  libraryChanged: 'library:changed',
  importProgress: 'library:import-progress',
  folderCreate: 'folder:create',
  folderRename: 'folder:rename',
  folderDelete: 'folder:delete',

  docCreate: 'doc:create',
  docGet: 'doc:get',
  docUpdate: 'doc:update',
  docDelete: 'doc:delete',
  docOpen: 'doc:open',
  docAddPages: 'doc:add-pages',
  docExport: 'doc:export',
  docPrint: 'doc:print',

  pageParams: 'page:params',
  pageDetect: 'page:detect',
  pageStraighten: 'page:straighten',
  pageAutoRotate: 'page:auto-rotate',
  pageRotate: 'page:rotate',
  pageSplit: 'page:split',
  pageDelete: 'page:delete',
  pageMove: 'page:move',
  pageOcr: 'page:ocr',

  jobsGet: 'jobs:get',
  jobsChanged: 'jobs:changed',
  jobOpenFolder: 'jobs:open-folder',
  jobOpenFile: 'jobs:open-file',
  jobsClear: 'jobs:clear',
  savePromptGet: 'save-prompt:get',
  savePromptChoose: 'save-prompt:choose',
  savePromptConfirm: 'save-prompt:confirm',
  savePromptCancel: 'save-prompt:cancel',

  printJobGet: 'print:get',
  printReady: 'print:ready',

  pdfToolsOpen: 'pdftools:open',
  pdfToolsClose: 'pdftools:close',
  pdfToolsSave: 'pdftools:save',
  pdfToolsSplit: 'pdftools:split',

  serviceRequest: 'service:request',
  serviceRespond: 'service:respond'
} as const

export type Unsubscribe = () => void
export type AppWindow = 'library' | 'settings' | 'pdftools' | 'downloads'

export interface DocumentPatch {
  title?: string
  folderId?: string | null
  layout?: DocLayout
  tags?: string[]
}

export interface ImportProgress {
  docId: string
  done: number
  total: number
}

export interface PrintJobView {
  sheets: { size: Size; items: { url: string; rect: Rect }[] }[]
}

export interface ServiceRequest {
  id: number
  op: string
  args: Record<string, unknown>
}

/** The only surface exposed to renderers (window.api) via contextBridge. */
export interface SnapApi {
  getAppInfo(): Promise<AppInfo>
  openExternal(url: string): Promise<void>
  openWindow(window: AppWindow): Promise<void>
  checkForUpdates(): Promise<void>
  chooseFolder(current?: string): Promise<string | null>

  onCaptureInit(callback: (init: CaptureInit) => void): Unsubscribe
  submitCapture(pngDataUrl: string, mode?: 'result' | 'quickCopy'): Promise<void>
  cancelCapture(): Promise<void>
  startCapture(): Promise<void>

  openImage(): Promise<void>
  submitImage(dataUrl: string): Promise<void>

  getResult(): Promise<ResultState | null>
  onResultUpdate(callback: (state: ResultState) => void): Unsubscribe
  rerunOcr(languages: OcrLanguage[]): Promise<void>
  saveText(text: string): Promise<boolean>
  copyText(text: string): Promise<void>
  resultToLibrary(): Promise<void>

  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  onSettingsChanged(callback: (settings: Settings) => void): Unsubscribe
  getShortcutStatus(): Promise<ShortcutStatus>

  listDocuments(query: LibraryQuery): Promise<SearchHit[]>
  listFolders(): Promise<FolderRecord[]>
  listTags(): Promise<string[]>
  onLibraryChanged(callback: (docId: string | null) => void): Unsubscribe
  onImportProgress(callback: (progress: ImportProgress) => void): Unsubscribe
  createFolder(name: string): Promise<FolderRecord>
  renameFolder(id: string, name: string): Promise<void>
  deleteFolder(id: string): Promise<void>

  createDocument(source: PageSource, folderId: string | null): Promise<string | null>
  getDocument(id: string): Promise<DocumentDetail | null>
  updateDocument(id: string, patch: DocumentPatch): Promise<void>
  deleteDocument(id: string): Promise<void>
  openDocument(id: string): Promise<void>
  addPages(id: string, source: PageSource): Promise<boolean>
  exportDocument(id: string, format: ExportFormat, pdf?: PdfExportOptions): Promise<void>
  printDocument(id: string, paper: PaperSize, marginMm: number): Promise<void>

  setPageParams(pageId: string, patch: Partial<PageParams>): Promise<void>
  detectPage(pageId: string): Promise<void>
  straightenPage(pageId: string): Promise<void>
  autoRotatePage(pageId: string): Promise<void>
  rotatePage(pageId: string, delta: 90 | -90): Promise<void>
  splitPage(pageId: string): Promise<void>
  deletePage(pageId: string): Promise<void>
  movePage(pageId: string, toIndex: number): Promise<void>
  ocrPage(pageId: string): Promise<void>

  getJobs(): Promise<ExportJob[]>
  onJobsChanged(callback: (jobs: ExportJob[]) => void): Unsubscribe
  openJobFolder(id: string): Promise<void>
  openJobFile(id: string): Promise<void>
  clearJobs(): Promise<void>
  getSavePrompt(): Promise<SavePrompt | null>
  chooseSaveFolder(): Promise<string | null>
  confirmSave(folder: string, fileName: string): Promise<void>
  cancelSave(): Promise<void>

  getPrintJob(id: string): Promise<PrintJobView | null>
  printReady(id: string): Promise<void>

  openPdfFiles(): Promise<PdfToolFile[]>
  closePdfFile(fileId: string): Promise<void>
  savePdfPages(pages: PdfToolPage[], name: string): Promise<void>
  splitPdfPages(pages: PdfToolPage[], mode: SplitMode, name: string): Promise<void>

  onServiceRequest(callback: (request: ServiceRequest) => void): Unsubscribe
  respondService(id: number, ok: boolean, payload: unknown): Promise<void>
}
