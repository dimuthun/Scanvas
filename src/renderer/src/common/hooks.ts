import { useEffect, useRef, useState } from 'react'
import type { AppInfo, Settings } from '@shared/types'

/** Re-run `load` now and whenever the library changes (optionally only for one document). */
export function useLibraryRefresh(load: () => void, docId?: string): void {
  const latest = useRef(load)
  latest.current = load
  useEffect(() => {
    latest.current()
    let timer: number | undefined
    const unsubscribe = window.api.onLibraryChanged((changed) => {
      if (docId && changed && changed !== docId) return
      // Coalesce bursts (imports emit many events).
      window.clearTimeout(timer)
      timer = window.setTimeout(() => latest.current(), 60)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [docId])
}

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    return window.api.onSettingsChanged(setSettings)
  }, [])
  return settings
}

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])
  return info
}

export function queryParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
