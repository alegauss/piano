import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { restoreTheme } from './lib/theme'
import './app.css'

// Before the first paint, so a light-theme user never sees a dark flash.
restoreTheme()

const container = document.getElementById('root')

if (container === null) {
  throw new Error('renderer: #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
