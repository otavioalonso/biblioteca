# Biblioteca

An offline-capable ebook reader PWA with reading statistics and time estimates.

## Features

- **EPUB support** — paginated rendering via epub.js
- **Reading stats** — tracks time per position using 200 percentage-based bins
- **Time estimates** — EWMA-based pace tracking with 300 WPM cap and 30–300 WPM validity gate
- **Heatmap progress bar** — grayscale visualization of time spent across the book
- **Themes** — light, dark, and sepia with full font color enforcement
- **Customizable typography** — font family, size, text alignment, line height, paragraph spacing
- **Adjustable margins** — separate horizontal and vertical controls
- **Tap navigation** — tap left/right edges to turn pages, hold to repeat with acceleration
- **Hidden toolbar** — tap bottom 12% to toggle; two-row layout with page numbers and time info
- **Bookshelf** — grid view with extracted cover images, multi-book import
- **Offline / PWA** — installable, works fully offline via service worker + IndexedDB storage
- **Cookie-based progress** — resume reading position across sessions
- **Idle detection** — 3-minute timeout + visibility API pause

## Tech Stack

- React 19 + Vite 8
- [epub.js](https://github.com/futurepress/epub.js) — EPUB rendering
- [localforage](https://github.com/localForage/localForage) — IndexedDB for books, stats, and covers
- [js-cookie](https://github.com/js-cookie/js-cookie) — progress cookies

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
  components/
    Reader.jsx        # Main reading view, epub.js rendition, navigation
    Library.jsx       # Bookshelf grid with covers
    HeatmapBar.jsx    # Theme-aware heatmap progress bar
    SettingsPanel.jsx  # Font, theme, margin, spacing controls
  utils/
    readingStats.js   # Statistics module (bins, EWMA, estimates, heatmap)
    storage.js        # Persistence layer (cookies, localforage, settings)
    themeColor.js     # PWA status-bar color sync
  App.jsx             # Routes between Library and Reader
public/
  sw.js               # Service worker for offline support
  manifest.json       # PWA manifest
```
