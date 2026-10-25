import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PrintJobView } from '@shared/api'
import { queryParam } from '../common/hooks'

const jobId = queryParam('job') ?? ''

/** Hidden page: lays out sheets in points, waits for every image, then asks main to print. */
function PrintPage(): React.JSX.Element | null {
  const [job, setJob] = useState<PrintJobView | null>(null)

  useEffect(() => {
    void window.api.getPrintJob(jobId).then(setJob)
  }, [])

  useEffect(() => {
    if (!job) return
    const images = [...document.images]
    void Promise.all(images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))).then(() =>
      window.api.printReady(jobId)
    )
  }, [job])

  if (!job) return null

  // One named @page per distinct sheet size so mixed portrait/landscape sheets print correctly.
  const sizes = [...new Set(job.sheets.map((s) => `${s.size.width.toFixed(2)}pt ${s.size.height.toFixed(2)}pt`))]
  const pageRules = sizes.map((size, i) => `@page s${i} { size: ${size}; margin: 0; }`).join('\n')

  return (
    <>
      <style>{`html, body { margin: 0; background: #fff; } .sheet { position: relative; overflow: hidden; break-after: page; } .sheet:last-child { break-after: auto; } .sheet img { position: absolute; } ${pageRules}`}</style>
      {job.sheets.map((sheet, i) => (
        <div
          key={i}
          className="sheet"
          style={{
            width: `${sheet.size.width}pt`,
            height: `${sheet.size.height}pt`,
            page: `s${sizes.indexOf(`${sheet.size.width.toFixed(2)}pt ${sheet.size.height.toFixed(2)}pt`)}`
          }}
        >
          {sheet.items.map((item, k) => (
            <img
              key={k}
              src={item.url}
              alt=""
              style={{ left: `${item.rect.x}pt`, top: `${item.rect.y}pt`, width: `${item.rect.width}pt`, height: `${item.rect.height}pt` }}
            />
          ))}
        </div>
      ))}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<PrintPage />)
