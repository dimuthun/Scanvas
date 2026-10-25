import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const shared = { '@shared': resolve('src/shared') }

// Strict CSP is injected only into production HTML; the dev server needs
// inline scripts for React Fast Refresh.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: scanvas:",
  "connect-src 'self' data: blob: scanvas:",
  "worker-src 'self' blob:"
].join('; ')

function productionCsp(): Plugin {
  return {
    name: 'scanvas-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head' }
    ]
  }
}

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // Sandboxed preloads must be a single CommonJS file with no external requires.
      externalizeDeps: false,
      rolldownOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), productionCsp()],
    build: {
      rolldownOptions: {
        input: Object.fromEntries(
          ['overlay', 'result', 'settings', 'library', 'editor', 'pdftools', 'savepath', 'downloads', 'service', 'print'].map(
            (page) => [page, resolve(`src/renderer/${page}.html`)]
          )
        )
      }
    }
  }
})
