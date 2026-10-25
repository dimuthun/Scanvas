import { useState } from 'react'
import type { Translate } from '@shared/i18n'
import type { PaperSize, PdfExportOptions, PdfQuality } from '@shared/types'
import { Modal } from '../common/Modal'

const PAPERS: PaperSize[] = ['a4', 'letter', 'auto']
const QUALITIES: PdfQuality[] = ['high', 'medium', 'small']

export function PdfOptionsDialog({ t, initial, onClose }: { t: Translate; initial: PdfExportOptions; onClose(options: PdfExportOptions | null): void }): React.JSX.Element {
  const [options, setOptions] = useState(initial)
  const set = <K extends keyof PdfExportOptions>(key: K, value: PdfExportOptions[K]): void => setOptions((o) => ({ ...o, [key]: value }))
  return (
    <Modal title={t('editorPdfOptions')} onClose={() => onClose(null)}>
      <div className="options-grid">
        <label className="field">
          <span>{t('editorPaper')}</span>
          <select value={options.paper} onChange={(e) => set('paper', e.target.value as PaperSize)}>
            {PAPERS.map((p) => (
              <option key={p} value={p}>
                {t(`paper_${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('editorMargin')}</span>
          <input
            type="number"
            min={0}
            max={50}
            value={options.marginMm}
            disabled={options.paper === 'auto'}
            onChange={(e) => set('marginMm', Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
        <label className="field">
          <span>{t('editorQuality')}</span>
          <select value={options.quality} onChange={(e) => set('quality', e.target.value as PdfQuality)}>
            {QUALITIES.map((q) => (
              <option key={q} value={q}>
                {t(`quality_${q}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={options.textLayer} onChange={(e) => set('textLayer', e.target.checked)} />
        {t('editorTextLayer')}
      </label>
      <div className="modal-actions">
        <button onClick={() => onClose(null)}>{t('commonCancel')}</button>
        <button className="primary" onClick={() => onClose(options)}>
          {t('editorExport')}
        </button>
      </div>
    </Modal>
  )
}
