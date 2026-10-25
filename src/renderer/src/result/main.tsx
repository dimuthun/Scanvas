import { createRoot } from 'react-dom/client'
import '../common/theme.css'
import './result.css'
import { ResultPage } from './ResultPage'

createRoot(document.getElementById('root')!).render(<ResultPage />)
