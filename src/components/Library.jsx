import { useEffect, useRef, useState, useCallback } from 'react';
import setThemeColor from '../utils/themeColor';

/* ---- Generative background: grid of softly varying squares ------- */
function drawBackground(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const cellSize = 3;
  const cols = Math.ceil(w / cellSize) + 1;
  const rows = Math.ceil(h / cellSize) + 1;

  /* Seeded-ish random from position so it's stable across redraws
     but still looks organic */
  const rand = () => Math.random();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const r = rand();
      const x = col * cellSize;
      const y = row * cellSize;

      if (isDark) {
        /* Dark mode: very subtle lighter squares on #16171d */
        const l = 8 + r * 6;       // lightness 8–14%
        const a = 0.3 + r * 0.4;   // alpha 0.3–0.7
        ctx.fillStyle = `hsla(230, 8%, ${l}%, ${a})`;
      } else {
        /* Light mode: soft warm/cool gray squares on white */
        const hue = 220 + r * 40;  // blue-ish to purple-ish
        const sat = 5 + r * 15;
        const l = 88 + r * 10;     // lightness 88–98%
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${l}%)`;
      }

      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }

  /* Soft radial vignette to fade edges */
  const cx = w / 2, cy = h / 2;
  const radius = Math.max(w, h) * 0.7;
  const bg = isDark ? '22, 23, 29' : '255, 255, 255';
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
  grad.addColorStop(0, `rgba(${bg}, 0)`);
  grad.addColorStop(1, `rgba(${bg}, 0.85)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export default function Library({ books, covers, onImport, onOpen }) {
  const fileRef = useRef();
  const canvasRef = useRef();
  const [importingCount, setImportingCount] = useState(0);

  /* Set PWA status-bar color to match library background
     (follows system light/dark preference) */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setThemeColor(mq.matches ? 'library-dark' : 'library-light');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  /* Draw & redraw generative background */
  const paint = useCallback(() => {
    if (canvasRef.current) drawBackground(canvasRef.current);
  }, []);

  useEffect(() => {
    paint();
    window.addEventListener('resize', paint);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', paint);
    return () => {
      window.removeEventListener('resize', paint);
      mq.removeEventListener('change', paint);
    };
  }, [paint]);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    e.target.value = '';

    setImportingCount(files.length);
    try {
      await Promise.all(
        files.map((file) =>
          onImport(file).finally(() => setImportingCount((c) => c - 1))
        )
      );
    } catch { /* individual errors handled by onImport */ }
  };

  return (
    <div className="library">
      <canvas ref={canvasRef} className="library-bg" aria-hidden="true" />
      <input
        ref={fileRef}
        type="file"
        accept=".epub,.mobi,.azw,.azw3"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="bookshelf-grid">
        {books.map((book) => (
          <div key={book.id} className="book-card" onClick={() => onOpen(book.id)}>
            <div className="book-cover-wrapper">
              {covers[book.id] ? (
                <img
                  className="book-cover-img"
                  src={covers[book.id]}
                  alt={book.title}
                  draggable={false}
                />
              ) : (
                <div className="book-cover-placeholder">
                  <span className="book-cover-title">{book.title}</span>
                  {book.author && (
                    <span className="book-cover-author">{book.author}</span>
                  )}
                </div>
              )}
            </div>
            <div className="book-info">
              <span className="book-info-title">{book.title}</span>
              {book.author && <span className="book-info-author">{book.author}</span>}
            </div>
          </div>
        ))}

        {/* "Add book" card */}
        <div
          className="book-card book-card-add"
          onClick={() => !importingCount && fileRef.current.click()}
        >
          <div className="book-cover-wrapper book-add-cover">
            {importingCount > 0 ? (
              <span className="book-add-spinner">⏳</span>
            ) : (
              <span className="book-add-icon">+</span>
            )}
          </div>
          <div className="book-info">
            <span className="book-info-title">
              {importingCount > 0
                ? `Importing ${importingCount}…`
                : 'Add books'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
