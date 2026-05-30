import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'
import { loadPackagedHeeboFonts } from './utils/loadPackagedHeeboFonts'
import App from './App.tsx'

async function loadFonts(): Promise<void> {
  if (import.meta.env.DEV) {
    const { loadDevFonts } = await import('./utils/loadDevFonts')
    await loadDevFonts()
    return
  }
  await loadPackagedHeeboFonts()
}

loadFonts().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
