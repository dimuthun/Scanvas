import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Download, FileText, FolderOpen } from 'lucide-react'
import type { SavePrompt } from '@shared/types'
import '../common/theme.css'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import './savepath.css'

/** "Save to" dialog shown before an export (port of CamScanner's savePath window). */
function SavePathPage(): React.JSX.Element {
  const t = useTranslator()
  const [prompt, setPrompt] = useState<SavePrompt | null>(null)
  const [folder, setFolder] = useState('')
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    void window.api.getSavePrompt().then((p) => {
      if (!p) return
      setPrompt(p)
      setFolder(p.folder)
      setFileName(p.fileName)
    })
  }, [])

  useEffect(() => {
    document.title = t('savePathTitle')
  }, [t])

  const change = async (): Promise<void> => {
    const chosen = await window.api.chooseSaveFolder()
    if (chosen) setFolder(chosen)
  }

  return (
    <AppShell title={t('savePathTitle')}>
      <form
        className="savepath"
        onSubmit={(event) => {
          event.preventDefault()
          if (folder && fileName.trim()) void window.api.confirmSave(folder, fileName.trim())
        }}
      >
        <label className="field">
          <span>{t('savePathFileName')}</span>
          <div className="input-row">
            <FileText className="field-icon" />
            <input value={fileName} onChange={(e) => setFileName(e.target.value)} autoFocus />
            {prompt && <span className="badge">.{prompt.extension}</span>}
          </div>
        </label>
        <div className="field">
          <span>{t('savePathFolder')}</span>
          <div className="input-row">
            <FolderOpen className="field-icon" />
            <input value={folder} readOnly title={folder} />
            <button type="button" className="sm" onClick={() => void change()}>
              {t('savePathChange')}
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => void window.api.cancelSave()}>
            {t('commonCancel')}
          </button>
          <button type="submit" className="primary" disabled={!folder || !fileName.trim()}>
            <Download /> {t('savePathSave')}
          </button>
        </div>
      </form>
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<SavePathPage />)
