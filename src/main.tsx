import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'
import { loadPackagedHeeboFonts } from './utils/loadPackagedHeeboFonts'
import App from './App.tsx'

async function loadFonts(): Promise<void> {
  if (import.meta.env.PROD) {
    await loadPackagedHeeboFonts()
    return
  }
  await Promise.all([
    import('@fontsource/heebo/400.css'),
    import('@fontsource/heebo/500.css'),
    import('@fontsource/heebo/600.css'),
    import('@fontsource/heebo/700.css'),
  ])
}

loadFonts().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
