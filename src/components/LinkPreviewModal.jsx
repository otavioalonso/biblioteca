import { useEffect, useRef } from 'react';
import ePub from 'epubjs';

export default function LinkPreviewModal({ bookBuffer, href, theme, onNavigate, onClose }) {
  const previewRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);

  /* Theme colours for the preview rendition */
  const themeColors = {
    light: { color: '#1a1a1a', background: '#ffffff' },
    dark:  { color: '#d4d4d4', background: '#1e1e1e' },
    sepia: { color: '#5b4636', background: '#f4ecd8' },
  };
  const colors = themeColors[theme] || themeColors.light;

  useEffect(() => {
    if (!bookBuffer || !href || !previewRef.current) return;

    const book = ePub(bookBuffer.slice(0));
    bookRef.current = book;

    const rendition = book.renderTo(previewRef.current, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'scrolled-doc',   // scrollable so the user can see all content
      gap: 0,
    });
    renditionRef.current = rendition;

    rendition.themes.default({
      body: {
        'font-size': '15px !important',
        'line-height': '1.5 !important',
        margin: '0 !important',
        padding: '12px 16px !important',
        color: `${colors.color} !important`,
        background: `${colors.background} !important`,
        '-webkit-user-select': 'none !important',
        'user-select': 'none !important',
      },
    });

    rendition.display(href);

    /* Prevent links inside the preview from triggering further navigation */
    rendition.on('link', (e) => {
      e?.preventDefault?.();
    });

    return () => {
      if (renditionRef.current) renditionRef.current.destroy();
      if (bookRef.current) bookRef.current.destroy();
    };
  }, [bookBuffer, href]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="link-preview-backdrop" onClick={onClose}>
      <div className="link-preview-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="link-preview-content" ref={previewRef} />
        <div className="link-preview-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onNavigate(href)}
          >
            Go to location →
          </button>
        </div>
      </div>
    </div>
  );
}
