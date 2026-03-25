import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* Register service worker for offline / PWA support (production only) */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration failed — app still works, just no offline support */
    });
  });
}

/* Lock orientation to portrait when running as an installed PWA */
try {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone;
  if (isStandalone && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {});
  }
} catch (_) {
  /* orientation lock not supported — ignored */
}

/* Pre-load all Google Fonts so the service worker caches the .woff2 files.
   document.fonts.load() triggers a real network fetch for each family,
   which the SW intercepts and stores for offline use. */
const PRELOAD_FONTS = [
  'EB Garamond',
  'Baskervville',
  'Literata',
  'Lora',
  'Ovo',
  'Lato',
  'Atkinson Hyperlegible',
];
if (document.fonts) {
  PRELOAD_FONTS.forEach((family) => {
    document.fonts.load(`400 1em "${family}"`).catch(() => {});
    document.fonts.load(`700 1em "${family}"`).catch(() => {});
    document.fonts.load(`italic 400 1em "${family}"`).catch(() => {});
  });
}
