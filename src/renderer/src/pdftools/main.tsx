import { createRoot } from 'react-dom/client'
import '../common/theme.css'
import './pdftools.css'
import { PdfToolsPage } from './PdfToolsPage'

createRoot(document.getElementById('root')!).render(<PdfToolsPage />)
