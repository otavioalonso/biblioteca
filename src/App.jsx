import { useState, useCallback, useEffect } from 'react';
import ePub from 'epubjs';
import Library from './components/Library';
import Reader from './components/Reader';
import {
  loadLibraryCookie,
  saveLibraryCookie,
  saveBookFile,
  removeBook as removeBookFromStorage,
  resetBookData as resetBookDataInStorage,
  saveCover,
  loadAllCovers,
} from './utils/storage';
import './App.css';

function generateId(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) + '_' + Date.now().toString(36);
}

function App() {
  const [library, setLibrary] = useState(() => loadLibraryCookie());
  const [covers, setCovers] = useState({});
  const [activeBookId, setActiveBookId] = useState(null);

  useEffect(() => {
    saveLibraryCookie(library);
  }, [library]);

  /* Load all cached covers on mount */
  useEffect(() => {
    loadAllCovers().then(setCovers);
  }, []);

  const handleImport = useCallback(async (file) => {
    const buf = await file.arrayBuffer();
    const id = generateId(file.name);

    /* Extract metadata + cover from the epub */
    let title = file.name.replace(/\.(epub|mobi|azw3?)$/i, '');
    let author = '';
    let coverDataUrl = null;

    try {
      const book = ePub(buf.slice(0)); // use a copy so original stays intact
      await book.ready;

      /* Title & author */
      const meta = book.packaging?.metadata;
      if (meta?.title) title = meta.title;
      if (meta?.creator) author = meta.creator;

      /* Cover image → data URL */
      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        try {
          const resp = await fetch(coverUrl);
          const blob = await resp.blob();
          coverDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch { /* ignore cover fetch failures */ }
        URL.revokeObjectURL(coverUrl);
      }
      book.destroy();
    } catch { /* non-epub or corrupt — just use filename as title */ }

    const entry = { id, title, author, fileName: file.name, addedAt: Date.now() };
    await saveBookFile(id, buf);

    if (coverDataUrl) {
      await saveCover(id, coverDataUrl);
      setCovers((prev) => ({ ...prev, [id]: coverDataUrl }));
    }

    setLibrary((prev) => [...prev, entry]);
  }, []);

  const handleOpen = useCallback((id) => setActiveBookId(id), []);
  const handleClose = useCallback(() => setActiveBookId(null), []);

  /* Delete book from within the reader (goes back to library) */
  const handleDeleteFromReader = useCallback(async (id) => {
    await removeBookFromStorage(id);
    setLibrary((prev) => prev.filter((b) => b.id !== id));
    setCovers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveBookId(null);
  }, []);

  /* Reset reading data (stats + progress) but keep the book */
  const handleResetData = useCallback(async (id) => {
    await resetBookDataInStorage(id);
  }, []);

  if (activeBookId) {
    return (
      <Reader
        bookId={activeBookId}
        bookMeta={library.find((b) => b.id === activeBookId)}
        onClose={handleClose}
        onDelete={handleDeleteFromReader}
        onResetData={handleResetData}
      />
    );
  }

  return (
    <Library
      books={library}
      covers={covers}
      onImport={handleImport}
      onOpen={handleOpen}
    />
  );
}

export default App;
