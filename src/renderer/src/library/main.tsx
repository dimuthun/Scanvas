import { createRoot } from 'react-dom/client'
import '../common/theme.css'
import './library.css'
import { LibraryPage } from './LibraryPage'

createRoot(document.getElementById('root')!).render(<LibraryPage />)
