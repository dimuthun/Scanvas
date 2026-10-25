import { createRoot } from 'react-dom/client'
import '../common/theme.css'
import './settings.css'
import { SettingsPage } from './SettingsPage'

createRoot(document.getElementById('root')!).render(<SettingsPage />)
