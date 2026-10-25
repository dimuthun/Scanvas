import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { resolveTheme, type ResolvedTheme } from '@shared/themes'
import { useSettings } from '../common/hooks'

const darkQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

/**
 * Resolve the theme from settings (+ OS light/dark for "System") and write
 * its tokens onto <html>. Re-applies live when settings or the OS change.
 * Returns null until settings have loaded.
 */
export function useTheme(): ResolvedTheme | null {
  const settings = useSettings()
  const [osDark, setOsDark] = useState(() => darkQuery().matches)

  useEffect(() => {
    const query = darkQuery()
    const onChange = (): void => setOsDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    void window.api.getAppInfo().then((info) => (document.documentElement.dataset['platform'] = info.platform))
  }, [])

  const theme = useMemo(
    () => (settings ? resolveTheme({ theme: settings.theme, accent: settings.accent, transparency: settings.transparency }, osDark) : null),
    [settings?.theme, settings?.accent, settings?.transparency, osDark]
  )

  useLayoutEffect(() => {
    if (!theme) return
    const root = document.documentElement
    for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value)
    root.dataset['base'] = theme.base
    root.dataset['theme'] = theme.id
  }, [theme])

  return theme
}
