import { createRoot } from 'react-dom/client'
import '../common/theme.css'
import './editor.css'
import { EditorPage } from './EditorPage'

createRoot(document.getElementById('root')!).render(<EditorPage />)
