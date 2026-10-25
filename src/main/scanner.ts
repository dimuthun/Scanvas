import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app } from 'electron'
import { resourcePath } from './windows'

export type ScannerFailure = 'unsupported' | 'noDevice' | 'failed'

export class ScannerError extends Error {
  constructor(
    readonly reason: ScannerFailure,
    detail = ''
  ) {
    super(detail || reason)
  }
}

/**
 * Scan one page through the standard Windows WIA dialog.
 * Resolves with the path of a temporary PNG, or null when the user cancels.
 */
export function scanPage(): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.reject(new ScannerError('unsupported'))
  const outFile = join(app.getPath('temp'), `scanvas-scan-${randomUUID()}.png`)
  const script = resourcePath('scripts', 'wia-scan.ps1')
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutFile', outFile],
      { windowsHide: true }
    )
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', (error) => reject(new ScannerError('failed', error.message)))
    child.on('close', (code) => {
      if (code === 0) resolve(outFile)
      else if (code === 3) resolve(null)
      else if (code === 2) reject(new ScannerError('noDevice'))
      else reject(new ScannerError('failed', stderr.trim()))
    })
  })
}
