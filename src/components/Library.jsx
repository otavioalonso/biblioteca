import { useEffect, useRef, useState } from 'react';
import setThemeColor from '../utils/themeColor';

export default function Library({ books, covers, onImport, onOpen }) {
  const fileRef = useRef();
  const [importingCount, setImportingCount] = useState(0);

  /* Set PWA status-bar color to match library background
     (follows system light/dark preference) */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setThemeColor(mq.matches ? 'library-dark' : 'light');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
      {/* <header className="library-header">
        <h1>📚 Reader</h1>
      </header> */}
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
