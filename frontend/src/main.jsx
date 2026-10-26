import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { I18nProvider } from './i18n/I18n'
import './styles/base.css'
import './styles/layout.css'
import './styles/live.css'
import './styles/panels.css'
import './styles/overview.css'
import './styles/modal.css'
import './styles/login.css'
import './styles/effects.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
