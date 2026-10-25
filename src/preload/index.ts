import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type SnapApi, type Unsubscribe } from '@shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const invoke =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

const api: SnapApi = {
  getAppInfo: invoke(IPC.appInfo),
  openExternal: invoke(IPC.openExternal),
  openWindow: invoke(IPC.openWindow),
  checkForUpdates: invoke(IPC.checkUpdates),
  chooseFolder: invoke(IPC.chooseFolder),

  onCaptureInit: (callback) => subscribe(IPC.captureInit, callback),
  submitCapture: invoke(IPC.captureSubmit),
  cancelCapture: invoke(IPC.captureCancel),
  startCapture: invoke(IPC.captureStart),

  openImage: invoke(IPC.imageOpen),
  submitImage: invoke(IPC.imageSubmit),

  getResult: invoke(IPC.resultGet),
  onResultUpdate: (callback) => subscribe(IPC.resultUpdate, callback),
  rerunOcr: invoke(IPC.resultRerun),
  saveText: invoke(IPC.resultSaveText),
  copyText: invoke(IPC.clipboardWrite),
  resultToLibrary: invoke(IPC.resultToLibrary),

  getSettings: invoke(IPC.settingsGet),
  updateSettings: invoke(IPC.settingsUpdate),
  onSettingsChanged: (callback) => subscribe(IPC.settingsChanged, callback),
  getShortcutStatus: invoke(IPC.shortcutStatus),

  listDocuments: invoke(IPC.libraryList),
  listFolders: invoke(IPC.libraryFolders),
  listTags: invoke(IPC.libraryTags),
  onLibraryChanged: (callback) => subscribe(IPC.libraryChanged, callback),
  onImportProgress: (callback) => subscribe(IPC.importProgress, callback),
  createFolder: invoke(IPC.folderCreate),
  renameFolder: invoke(IPC.folderRename),
  deleteFolder: invoke(IPC.folderDelete),

  createDocument: invoke(IPC.docCreate),
  getDocument: invoke(IPC.docGet),
  updateDocument: invoke(IPC.docUpdate),
  deleteDocument: invoke(IPC.docDelete),
  openDocument: invoke(IPC.docOpen),
  addPages: invoke(IPC.docAddPages),
  exportDocument: invoke(IPC.docExport),
  printDocument: invoke(IPC.docPrint),

  setPageParams: invoke(IPC.pageParams),
  detectPage: invoke(IPC.pageDetect),
  straightenPage: invoke(IPC.pageStraighten),
  autoRotatePage: invoke(IPC.pageAutoRotate),
  rotatePage: invoke(IPC.pageRotate),
  splitPage: invoke(IPC.pageSplit),
  deletePage: invoke(IPC.pageDelete),
  movePage: invoke(IPC.pageMove),
  ocrPage: invoke(IPC.pageOcr),

  getJobs: invoke(IPC.jobsGet),
  onJobsChanged: (callback) => subscribe(IPC.jobsChanged, callback),
  openJobFolder: invoke(IPC.jobOpenFolder),
  openJobFile: invoke(IPC.jobOpenFile),
  clearJobs: invoke(IPC.jobsClear),
  getSavePrompt: invoke(IPC.savePromptGet),
  chooseSaveFolder: invoke(IPC.savePromptChoose),
  confirmSave: invoke(IPC.savePromptConfirm),
  cancelSave: invoke(IPC.savePromptCancel),

  getPrintJob: invoke(IPC.printJobGet),
  printReady: invoke(IPC.printReady),

  openPdfFiles: invoke(IPC.pdfToolsOpen),
  closePdfFile: invoke(IPC.pdfToolsClose),
  savePdfPages: invoke(IPC.pdfToolsSave),
  splitPdfPages: invoke(IPC.pdfToolsSplit),

  onServiceRequest: (callback) => subscribe(IPC.serviceRequest, callback),
  respondService: invoke(IPC.serviceRespond)
}

contextBridge.exposeInMainWorld('api', api)
