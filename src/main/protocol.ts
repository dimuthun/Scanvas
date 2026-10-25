import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { protocol } from 'electron'
import type { PageAsset } from '@shared/pageMath'
import { library, pageFile } from './library'
import { rendererDir } from './windows'

export const SCHEME = 'scanvas'
/** Origin of the packaged renderer pages. */
export const APP_ORIGIN = `${SCHEME}://app`

const ID = /^[0-9a-f-]{36}$/
const ASSETS: readonly PageAsset[] = ['original', 'processed', 'thumb']

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
}

/** Must run before app 'ready'. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
  ])
}

const notFound = (): Response => new Response('Not found', { status: 404 })

/**
 * scanvas://app/<file>                         → packaged renderer files (pages, scripts, wasm, pdf.js data)
 * scanvas://library/<docId>/<pageId>/<asset>   → library page images
 * Paths are validated so nothing outside those two roots can be read.
 */
export function registerAppProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    try {
      if (url.host === 'app') return await serveRendererFile(decodeURIComponent(url.pathname))
      if (url.host === 'library') return await servePageAsset(url.pathname)
    } catch {
      // fall through
    }
    return notFound()
  })
}

async function serveRendererFile(pathname: string): Promise<Response> {
  const file = normalize(join(rendererDir, pathname))
  if (!file.startsWith(rendererDir + sep)) return notFound()
  const bytes = await readFile(file)
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' }
  })
}

async function servePageAsset(pathname: string): Promise<Response> {
  const [docId, pageId, asset] = pathname.split('/').filter(Boolean)
  if (!ID.test(docId ?? '') || !ID.test(pageId ?? '') || !ASSETS.includes(asset as PageAsset)) return notFound()
  const page = library().getPage(pageId)
  if (!page || page.docId !== docId) return notFound()
  const ext = asset === 'thumb' ? 'jpg' : asset === 'original' ? page.originalExt : page.processedExt
  const bytes = await readFile(pageFile(page, asset as PageAsset))
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': ext === 'png' ? 'image/png' : 'image/jpeg',
      // URLs carry the page version, so a given URL never changes content.
      'cache-control': 'max-age=31536000, immutable'
    }
  })
}
