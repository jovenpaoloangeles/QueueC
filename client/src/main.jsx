import '@fontsource-variable/onest'
import '@fontsource-variable/spline-sans-mono'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './lib/theme.js'
import { ToastProvider } from './components/Toast.jsx'

initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
)
