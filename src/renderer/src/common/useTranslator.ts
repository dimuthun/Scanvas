import { useEffect, useMemo, useState } from 'react'
import { createTranslator, type Translate } from '@shared/i18n'
import type { Locale } from '@shared/types'

/** Translator for the UI locale chosen in settings; updates live when settings change. */
export function useTranslator(): Translate {
  const [locale, setLocale] = useState<Locale>('en')
  useEffect(() => {
    const refresh = (): void => {
      void window.api.getAppInfo().then((info) => {
        setLocale(info.locale)
        document.documentElement.lang = info.locale
      })
    }
    refresh()
    return window.api.onSettingsChanged(refresh)
  }, [])
  return useMemo(() => createTranslator(locale), [locale])
}
