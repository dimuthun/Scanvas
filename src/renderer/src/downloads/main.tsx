import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, CheckCircle2, ExternalLink, FileText, FolderOpen, Loader2, Trash2 } from 'lucide-react'
import type { MessageKey } from '@shared/i18n'
import type { ExportJob, JobState } from '@shared/types'
import '../common/theme.css'
import { formatBytes } from '../common/hooks'
import { useTranslator } from '../common/useTranslator'
import { AppShell } from '../ui/AppShell'
import { EmptyState, IconButton } from '../ui/controls'
import './downloads.css'

const STATE_LABEL: Record<JobState, MessageKey> = {
  ready: 'downloadsReady',
  progress: 'downloadsProgress',
  done: 'downloadsDone',
  failed: 'downloadsFailed'
}

function StateIcon({ state }: { state: JobState }): React.JSX.Element {
  if (state === 'done') return <CheckCircle2 className="state-icon done" />
  if (state === 'failed') return <AlertCircle className="state-icon failed" />
  return <Loader2 className="state-icon spinning" />
}

/** Export progress window (port of CamScanner's download window). */
function DownloadsPage(): React.JSX.Element {
  const t = useTranslator()
  const [jobs, setJobs] = useState<ExportJob[]>([])

  useEffect(() => {
    void window.api.getJobs().then(setJobs)
    return window.api.onJobsChanged(setJobs)
  }, [])

  useEffect(() => {
    document.title = t('downloadsTitle')
  }, [t])

  return (
    <AppShell
      title={t('downloadsTitle')}
      actions={
        jobs.some((j) => j.state === 'done' || j.state === 'failed') && (
          <IconButton icon={Trash2} label={t('downloadsClear')} onClick={() => void window.api.clearJobs()} />
        )
      }
    >
      {jobs.length === 0 ? (
        <EmptyState title={t('downloadsEmpty')} />
      ) : (
        <ul className="jobs">
          {jobs.map((job) => (
            <li key={job.id} className={`job card ${job.state}`}>
              <span className="file-icon">
                <FileText />
              </span>
              <div className="job-main">
                <div className="job-head">
                  <span className="name" title={job.filePath}>
                    {job.fileName}
                  </span>
                  <span className="status">
                    <StateIcon state={job.state} />
                    {t(STATE_LABEL[job.state])}
                    {job.state === 'done' && job.bytes > 0 && ` · ${formatBytes(job.bytes)}`}
                  </span>
                </div>
                <div className="bar">
                  <div className={`fill${job.state === 'ready' ? ' indeterminate' : ''}`} style={{ width: `${Math.round(job.progress * 100)}%` }} />
                </div>
                {job.state === 'failed' && job.error && <p className="error">{job.error}</p>}
              </div>
              <div className="job-actions">
                {job.state === 'done' && <IconButton icon={ExternalLink} label={t('downloadsOpenFile')} onClick={() => void window.api.openJobFile(job.id)} />}
                <IconButton icon={FolderOpen} label={t('downloadsOpenFolder')} onClick={() => void window.api.openJobFolder(job.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(<DownloadsPage />)
