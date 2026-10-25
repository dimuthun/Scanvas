import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions, type IpcMainInvokeEvent } from 'electron'
import { resolveTheme, type ResolvedTheme } from '@shared/themes'
import { getSettings } from './settings'

export type Page =
  | 'overlay'
  | 'result'
  | 'settings'
  | 'library'
  | 'editor'
  | 'pdftools'
  | 'savepath'
  | 'downloads'
  | 'service'
  | 'print'

const here = dirname(fileURLToPath(import.meta.url))
const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
export const rendererDir = join(here, '../renderer')
/** Built pages are served from a privileged custom scheme (fetch/wasm/workers work, unlike file://). */
const appOrigin = 'scanvas://app'

export function secureWebPreferences(): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(here, '../preload/index.cjs'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false
  }
}

/** Height of the custom title bar (must match `--titlebar-height` in the renderer CSS). */
export const TITLE_BAR_HEIGHT = 40

/** Windows drawn with the themed custom title bar (native controls stay, recolored). */
const chromed = new Set<BrowserWindow>()

export function currentTheme(): ResolvedTheme {
  const { theme, accent, transparency } = getSettings()
  return resolveTheme({ theme, accent, transparency }, nativeTheme.shouldUseDarkColors)
}

function chromeOptions(theme: ResolvedTheme): BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 13 } }
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: theme.titleBar.color, symbolColor: theme.titleBar.symbolColor, height: TITLE_BAR_HEIGHT }
  }
}

/** Re-apply theme colors to every open window (title-bar buttons and background). */
export function refreshWindowChrome(): void {
  const theme = currentTheme()
  for (const win of chromed) {
    if (win.isDestroyed()) continue
    win.setBackgroundColor(theme.tokens['--bg'])
    if (process.platform !== 'darwin') {
      win.setTitleBarOverlay({ color: theme.titleBar.color, symbolColor: theme.titleBar.symbolColor, height: TITLE_BAR_HEIGHT })
    }
  }
}

export interface AppWindowOptions extends BrowserWindowConstructorOptions {
  /** 'titlebar' (default) = themed custom title bar; 'plain' = no chrome changes (overlays, hidden windows). */
  chrome?: 'titlebar' | 'plain'
}

export function createAppWindow(page: Page, options: AppWindowOptions, query: Record<string, string> = {}): BrowserWindow {
  const { chrome = 'titlebar', ...rest } = options
  const theme = currentTheme()
  const win = new BrowserWindow({
    ...(chrome === 'titlebar' ? { ...chromeOptions(theme), backgroundColor: theme.tokens['--bg'] } : {}),
    ...rest,
    webPreferences: { ...secureWebPreferences(), ...rest.webPreferences }
  })
  if (chrome === 'titlebar') {
    chromed.add(win)
    win.on('closed', () => chromed.delete(win))
  }
  const search = new URLSearchParams(query).toString()
  const base = devServerUrl ?? appOrigin
  void win.loadURL(`${base}/${page}.html${search ? `?${search}` : ''}`)
  return win
}

/** Only accept IPC from our own pages (dev server or packaged renderer). */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  if (!url) return false
  if (devServerUrl && url.startsWith(`${devServerUrl}/`)) return true
  return url.startsWith(`${appOrigin}/`)
}

export function resourcePath(...segments: string[]): string {
  return app.isPackaged ? join(process.resourcesPath, ...segments) : join(app.getAppPath(), 'resources', ...segments)
}
