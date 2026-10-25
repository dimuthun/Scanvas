import { useEffect, useState, type ReactNode } from 'react'
import { Check, FileDown, FolderSync, Keyboard, Languages, Palette, RefreshCw, ScanLine, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import type { MessageKey, Translate } from '@shared/i18n'
import { ACCENTS, PRESETS, resolveTheme } from '@shared/themes'
import {
  ACCENT_IDS,
  FILTERS,
  HOTKEY_ACTIONS,
  OCR_LANGUAGES,
  THEME_IDS,
  type AccentId,
  type FilterName,
  type HotkeyAction,
  type OcrLanguage,
  type PaperSize,
  type PdfQuality,
  type Settings,
  type ShortcutStatus,
  type ThemeId
} from '@shared/types'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import { Switch } from '../ui/controls'
import { HotkeyInput } from './HotkeyInput'

const HOTKEY_LABELS: Record<HotkeyAction, MessageKey> = {
  regionOcr: 'settingsHotkeyRegionOcr',
  imageOcr: 'settingsHotkeyImageOcr',
  quickCopy: 'settingsHotkeyQuickCopy'
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="settings-card card">
      <h2 className="section-heading">
        <span className="section-icon">
          <Icon />
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="setting-control">{children}</div>
    </div>
  )
}

/** A tiny themed window mock-up, painted with the preset's own tokens. */
function ThemePreview({ theme, settings, osDark, selected, label, onSelect }: { theme: ThemeId; settings: Settings; osDark: boolean; selected: boolean; label: string; onSelect(): void }): React.JSX.Element {
  const resolved = resolveTheme({ theme, accent: settings.accent, transparency: settings.transparency }, osDark)
  const style = Object.fromEntries(Object.entries(resolved.tokens)) as React.CSSProperties
  return (
    <button className={`theme-card${selected ? ' selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <span className="theme-mock" style={style}>
        <span className="mock-titlebar">
          <i />
          <i />
          <i />
        </span>
        <span className="mock-body">
          <span className="mock-sidebar">
            <span className="mock-button" />
            <span className="mock-line" />
            <span className="mock-line short" />
          </span>
          <span className="mock-content">
            <span className="mock-card" />
            <span className="mock-card" />
          </span>
        </span>
      </span>
      <span className="theme-name">
        {selected && <Check />}
        {label}
      </span>
    </button>
  )
}

function FolderRow({ t, label, value, placeholder, onChange }: { t: Translate; label: string; value: string; placeholder: string; onChange(value: string): void }): React.JSX.Element {
  return (
    <Row label={label}>
      <span className={`path${value ? '' : ' muted'}`} title={value}>
        {value || placeholder}
      </span>
      <button
        className="sm"
        onClick={async () => {
          const folder = await window.api.chooseFolder(value)
          if (folder) onChange(folder)
        }}
      >
        {t('settingsChange')}
      </button>
    </Row>
  )
}

export function SettingsPage(): React.JSX.Element {
  const t = useTranslator()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<ShortcutStatus | null>(null)
  const [platform, setPlatform] = useState('win32')
  const [version, setVersion] = useState('')
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    void window.api.getShortcutStatus().then(setStatus)
    void window.api.getAppInfo().then((info) => {
      setPlatform(info.platform)
      setVersion(info.version)
    })
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = (): void => setOsDark(query.matches)
    query.addEventListener('change', onScheme)
    const unsubscribe = window.api.onSettingsChanged((next) => {
      setSettings(next)
      void window.api.getShortcutStatus().then(setStatus)
    })
    return () => {
      query.removeEventListener('change', onScheme)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    document.title = t('settingsTitle')
  }, [t])

  const update = (patch: Partial<Settings>): void => {
    void window.api.updateSettings(patch).then(setSettings)
  }

  const toggleLanguage = (lang: OcrLanguage): void => {
    if (!settings) return
    const current = settings.ocrLanguages
    const next = current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang]
    if (next.length > 0) update({ ocrLanguages: next })
  }

  // The base of the effective preset decides which variant of each accent is shown.
  const base = settings ? (settings.theme === 'system' ? (osDark ? 'dark' : 'light') : PRESETS[settings.theme].base) : 'light'
  const presetAccent = settings ? ACCENTS[PRESETS[settings.theme === 'system' ? (osDark ? 'dark' : 'light') : settings.theme].accent] : ACCENTS.blue
  const swatch = (accent: AccentId): string => (accent === 'theme' ? presetAccent : ACCENTS[accent])[base === 'light' ? 0 : 1]

  return (
    <AppShell title={t('settingsTitle')}>
      {settings && (
        <div className="settings-scroll">
          <div className="settings-page">
            <Section icon={Palette} title={t('settingsAppearance')}>
              <div className="theme-grid">
                {THEME_IDS.map((theme) => (
                  <ThemePreview
                    key={theme}
                    theme={theme}
                    settings={settings}
                    osDark={osDark}
                    selected={settings.theme === theme}
                    label={t(`theme_${theme}`)}
                    onSelect={() => update({ theme })}
                  />
                ))}
              </div>
              <Row label={t('settingsAccent')}>
                <div className="swatches" role="radiogroup" aria-label={t('settingsAccent')}>
                  {ACCENT_IDS.map((accent) => (
                    <button
                      key={accent}
                      role="radio"
                      aria-checked={settings.accent === accent}
                      aria-label={t(`accent_${accent}`)}
                      data-tooltip={t(`accent_${accent}`)}
                      className={`swatch${settings.accent === accent ? ' selected' : ''}${accent === 'theme' ? ' theme-default' : ''}`}
                      style={{ background: swatch(accent) }}
                      onClick={() => update({ accent })}
                    >
                      {settings.accent === accent && <Check />}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label={t('settingsTransparency')}>
                <Switch checked={settings.transparency} onChange={(transparency) => update({ transparency })} />
              </Row>
              <Row label={t('settingsLanguage')}>
                <select value={settings.locale} onChange={(e) => update({ locale: e.target.value as Settings['locale'] })}>
                  <option value="auto">{t('settingsLanguageAuto')}</option>
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                </select>
              </Row>
            </Section>

            <Section icon={Keyboard} title={t('settingsHotkeys')}>
              {HOTKEY_ACTIONS.map((action) => (
                <Row key={action} label={t(HOTKEY_LABELS[action])}>
                  <div className="hotkey-control">
                    <HotkeyInput
                      value={settings.hotkeys[action]}
                      platform={platform}
                      recordLabel={t('settingsHotkeyRecord')}
                      invalid={status?.[action] === false}
                      onChange={(value) => update({ hotkeys: { ...settings.hotkeys, [action]: value } })}
                    />
                    {status?.[action] === false && <small className="warning">{t('settingsHotkeyUnavailable')}</small>}
                  </div>
                </Row>
              ))}
            </Section>

            <Section icon={Languages} title={t('settingsOcr')}>
              <Row label={t('settingsLanguages')}>
                <div className="lang-chips">
                  {OCR_LANGUAGES.map((lang) => (
                    <button key={lang} className={`chip${settings.ocrLanguages.includes(lang) ? ' active' : ''}`} onClick={() => toggleLanguage(lang)}>
                      {settings.ocrLanguages.includes(lang) && <Check />}
                      {t(`lang_${lang}`)}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label={t('settingsAutoCopy')}>
                <Switch checked={settings.autoCopy} onChange={(autoCopy) => update({ autoCopy })} />
              </Row>
            </Section>

            <Section icon={ScanLine} title={t('settingsScanning')}>
              <Row label={t('settingsDefaultFilter')}>
                <select value={settings.defaultFilter} onChange={(e) => update({ defaultFilter: e.target.value as FilterName })}>
                  {FILTERS.map((f) => (
                    <option key={f} value={f}>
                      {t(`filter_${f}`)}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={t('settingsAutoEnhance')}>
                <Switch checked={settings.autoEnhance} onChange={(autoEnhance) => update({ autoEnhance })} />
              </Row>
              <Row label={t('settingsAutoOcr')}>
                <Switch checked={settings.autoOcrPages} onChange={(autoOcrPages) => update({ autoOcrPages })} />
              </Row>
            </Section>

            <Section icon={FileDown} title={t('settingsExport')}>
              <FolderRow t={t} label={t('settingsSaveFolder')} value={settings.savePath} placeholder={t('settingsDownloadsDefault')} onChange={(savePath) => update({ savePath })} />
              <Row label={t('settingsAlwaysAsk')}>
                <Switch checked={settings.alwaysAskSavePath} onChange={(alwaysAskSavePath) => update({ alwaysAskSavePath })} />
              </Row>
              <h3 className="sub-heading">{t('settingsPdfDefaults')}</h3>
              <Row label={t('editorPaper')}>
                <select value={settings.pdf.paper} onChange={(e) => update({ pdf: { ...settings.pdf, paper: e.target.value as PaperSize } })}>
                  {(['a4', 'letter', 'auto'] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(`paper_${p}`)}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={t('editorMargin')}>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={settings.pdf.marginMm}
                  onChange={(e) => update({ pdf: { ...settings.pdf, marginMm: Math.min(50, Math.max(0, Number(e.target.value) || 0)) } })}
                />
              </Row>
              <Row label={t('editorQuality')}>
                <select value={settings.pdf.quality} onChange={(e) => update({ pdf: { ...settings.pdf, quality: e.target.value as PdfQuality } })}>
                  {(['high', 'medium', 'small'] as const).map((q) => (
                    <option key={q} value={q}>
                      {t(`quality_${q}`)}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={t('editorTextLayer')}>
                <Switch checked={settings.pdf.textLayer} onChange={(textLayer) => update({ pdf: { ...settings.pdf, textLayer } })} />
              </Row>
            </Section>

            <Section icon={FolderSync} title={t('settingsWatch')}>
              <Row label={t('settingsWatchEnable')}>
                <Switch
                  checked={settings.watch.enabled}
                  disabled={!settings.watch.inputDir || !settings.watch.outputDir}
                  onChange={(enabled) => update({ watch: { ...settings.watch, enabled } })}
                />
              </Row>
              <FolderRow t={t} label={t('settingsWatchInput')} value={settings.watch.inputDir} placeholder={t('settingsNotSet')} onChange={(inputDir) => update({ watch: { ...settings.watch, inputDir } })} />
              <FolderRow t={t} label={t('settingsWatchOutput')} value={settings.watch.outputDir} placeholder={t('settingsNotSet')} onChange={(outputDir) => update({ watch: { ...settings.watch, outputDir } })} />
              <Row label={t('settingsDefaultFilter')}>
                <select value={settings.watch.filter} onChange={(e) => update({ watch: { ...settings.watch, filter: e.target.value as FilterName } })}>
                  {FILTERS.map((f) => (
                    <option key={f} value={f}>
                      {t(`filter_${f}`)}
                    </option>
                  ))}
                </select>
              </Row>
            </Section>

            <Section icon={SettingsIcon} title={t('settingsGeneral')}>
              <Row label={t('settingsLaunchAtLogin')}>
                <Switch checked={settings.launchAtLogin} onChange={(launchAtLogin) => update({ launchAtLogin })} />
              </Row>
              <Row label={<span className="muted">{version && t('settingsVersion', { version })}</span>}>
                <button className="sm" onClick={() => void window.api.checkForUpdates()}>
                  <RefreshCw /> {t('settingsCheckUpdates')}
                </button>
              </Row>
            </Section>
          </div>
        </div>
      )}
    </AppShell>
  )
}
