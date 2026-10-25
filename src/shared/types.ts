export type Locale = 'en' | 'zh-CN' | 'zh-TW'
export type ThemeId = 'system' | 'light' | 'dark' | 'midnight' | 'ocean' | 'forest' | 'sunset' | 'paper'
export type AccentId = 'theme' | 'blue' | 'violet' | 'pink' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'cyan'

export const THEME_IDS: readonly ThemeId[] = ['system', 'light', 'dark', 'midnight', 'ocean', 'forest', 'sunset', 'paper']
export const ACCENT_IDS: readonly AccentId[] = ['theme', 'blue', 'violet', 'pink', 'red', 'orange', 'amber', 'green', 'teal', 'cyan']
export type OcrLanguage = 'eng' | 'chi_sim' | 'chi_tra'
export type HotkeyAction = 'regionOcr' | 'imageOcr' | 'quickCopy'
export type FilterName = 'original' | 'magic' | 'gray' | 'bw'
export type PaperSize = 'a4' | 'letter' | 'auto'
export type PdfQuality = 'high' | 'medium' | 'small'

export const OCR_LANGUAGES: readonly OcrLanguage[] = ['eng', 'chi_sim', 'chi_tra']
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = ['regionOcr', 'imageOcr', 'quickCopy']
export const FILTERS: readonly FilterName[] = ['original', 'magic', 'gray', 'bw']

export interface PdfExportOptions {
  paper: PaperSize
  marginMm: number
  quality: PdfQuality
  /** Embed an invisible OCR text layer so the PDF is searchable/selectable. */
  textLayer: boolean
}

export interface WatchSettings {
  enabled: boolean
  inputDir: string
  outputDir: string
  filter: FilterName
}

export interface Settings {
  hotkeys: Record<HotkeyAction, string>
  ocrLanguages: OcrLanguage[]
  autoCopy: boolean
  theme: ThemeId
  accent: AccentId
  /** Translucent "glass" panels; off = solid surfaces. */
  transparency: boolean
  locale: 'auto' | Locale
  launchAtLogin: boolean
  /** Folder exports are saved to (the original app's "savePath"). */
  savePath: string
  alwaysAskSavePath: boolean
  defaultFilter: FilterName
  /** Detect edges, deskew and auto-rotate newly imported pages. */
  autoEnhance: boolean
  /** Recognize text of scanned pages in the background (needed for search and text layers). */
  autoOcrPages: boolean
  pdf: PdfExportOptions
  watch: WatchSettings
}

export interface AppInfo {
  version: string
  platform: string
  locale: Locale
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** Sent to each capture overlay: the frozen screenshot of its display. */
export interface CaptureInit {
  imageUrl: string
  /** Display size in CSS (DIP) pixels — the overlay window size. */
  width: number
  height: number
  scaleFactor: number
}

export interface OcrResult {
  text: string
  paragraphs: string[]
  /** Mean confidence 0–100 reported by Tesseract. */
  confidence: number
  languages: OcrLanguage[]
  durationMs: number
}

export type ResultStatus = 'loading' | 'done' | 'error'

export interface ResultState {
  /** Image being recognized, as a data URL. */
  image: string
  status: ResultStatus
  languages: OcrLanguage[]
  result?: OcrResult
  error?: string
}

export type ShortcutStatus = Record<HotkeyAction, boolean>

// ---------------------------------------------------------------- scanning

/** A point in normalized image coordinates (0–1). */
export interface Point {
  x: number
  y: number
}

/** Page corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

/** Clockwise rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270

/**
 * Non-destructive edit recipe applied to a page's original image, in order:
 * perspective warp → rotate → flip → crop → straighten → filter → adjustments.
 */
export interface PageParams {
  corners: Quad | null
  rotation: Rotation
  flipH: boolean
  flipV: boolean
  /** Normalized crop of the warped+rotated image (used by book-spread splitting). */
  crop: Rect | null
  /** Straighten angle in degrees, counter-clockwise positive (OpenCV convention). */
  angle: number
  filter: FilterName
  removeShadows: boolean
  /** −100…100 */
  brightness: number
  /** −100…100 */
  contrast: number
}

export type OcrStatus = 'none' | 'pending' | 'done' | 'error'
export type ImageExt = 'jpg' | 'png'

export interface PageRecord {
  id: string
  docId: string
  index: number
  /** Original (normalized) image size in pixels. */
  width: number
  height: number
  /** Processed image size in pixels. */
  outWidth: number
  outHeight: number
  params: PageParams
  originalExt: ImageExt
  processedExt: ImageExt
  /** Bumped whenever the processed image changes (cache busting). */
  version: number
  ocrStatus: OcrStatus
  ocrText: string | null
}

export type DocLayout = 'pages' | 'idcard'

export interface DocumentRecord {
  id: string
  title: string
  folderId: string | null
  layout: DocLayout
  createdAt: number
  updatedAt: number
  pageCount: number
  tags: string[]
  cover: { pageId: string; version: number } | null
}

export interface FolderRecord {
  id: string
  name: string
  documentCount: number
}

export interface DocumentDetail {
  document: DocumentRecord
  pages: PageRecord[]
}

export interface LibraryQuery {
  /** undefined = all documents, null = documents not in a folder. */
  folderId?: string | null
  tag?: string
  text?: string
}

export interface SearchHit {
  document: DocumentRecord
  /** Matching text with matches wrapped in \u0001 … \u0002. */
  snippet: string | null
  pageIndex: number | null
}

export type PageSource = 'images' | 'folder' | 'pdf' | 'scanner'

// ---------------------------------------------------------------- exports

export type ExportFormat = 'pdf' | 'docx' | 'images' | 'txt'
export type JobState = 'ready' | 'progress' | 'done' | 'failed'

export interface ExportJob {
  id: string
  fileName: string
  filePath: string
  state: JobState
  /** 0–1 */
  progress: number
  bytes: number
  error?: string
  startedAt: number
}

export interface SavePrompt {
  folder: string
  fileName: string
  extension: string
}

// ---------------------------------------------------------------- PDF tools

export interface PdfToolFile {
  fileId: string
  name: string
  pageCount: number
  bytes: Uint8Array
}

export interface PdfToolPage {
  fileId: string
  pageIndex: number
  rotation: Rotation
}

export type SplitMode = { kind: 'every'; size: number } | { kind: 'ranges'; ranges: string }
