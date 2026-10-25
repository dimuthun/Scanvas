import { createRoot } from 'react-dom/client'
import '../common/theme.css'
import './overlay.css'
import { Overlay } from './Overlay'

createRoot(document.getElementById('root')!).render(<Overlay />)
