import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { appSettings } from './lib/settings'
import { restoreTheme } from './lib/theme'
import './app.css'

// Before the first paint, so a light-theme user never sees a dark flash.
restoreTheme()

const container = document.getElementById('root')

if (container === null) {
  throw new Error('renderer: #root is missing from index.html')
}

// Drawn once the settings are read, one round trip to main, so every control
// starts where it was left rather than jumping there a moment later. A read
// that fails still draws the window, on the defaults, and says so.
void appSettings()
  .load()
  .finally(() => {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
